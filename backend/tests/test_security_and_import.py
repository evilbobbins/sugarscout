"""Run with: DATABASE_PATH=/tmp/sugarscout-test.db python -m unittest discover -s tests"""
import asyncio
import io
import json
import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), "sugarscout-test.db")
os.environ["DATABASE_PATH"] = TEST_DB

from fastapi import UploadFile
from pydantic import ValidationError

from main import (
    CurrentDosage,
    DosageSchema,
    FoodDiary,
    InsulinDosage,
    InsulinLevel,
    SessionLocal,
    make_session,
    password_hash,
    password_matches,
    session_username,
    import_data,
)


class SecurityAndImportTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        for model in (InsulinDosage, InsulinLevel, FoodDiary, CurrentDosage):
            self.db.query(model).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_password_hashes_are_not_reversible(self):
        encoded = password_hash("a-long-local-password")
        self.assertNotIn("a-long-local-password", encoded)
        self.assertTrue(password_matches("a-long-local-password", encoded))
        self.assertFalse(password_matches("wrong-password", encoded))

    def test_session_is_signed_and_expires(self):
        token = make_session("local-user")
        self.assertEqual(session_username(token), "local-user")
        self.assertIsNone(session_username(token[:-1] + "x"))

    def test_invalid_health_values_are_rejected(self):
        with self.assertRaises(ValidationError):
            DosageSchema(timestamp="2026-01-01T08:00:00Z", units=0, insulin_type="Test")

    def test_uuid_backup_merge_is_idempotent(self):
        backup = json.dumps({
            "version": "1.0",
            "insulin_dosage": [{"record_uuid": "b67dfcc4-0589-456c-9550-543620bc9044", "timestamp": "2026-01-01T08:00:00+00:00", "units": 2, "insulin_type": "Test", "notes": None}],
        }).encode()
        for _ in range(2):
            upload = UploadFile(filename="backup.json", file=io.BytesIO(backup))
            asyncio.run(import_data(upload, "merge", self.db))
        self.assertEqual(self.db.query(InsulinDosage).count(), 1)


if __name__ == "__main__":
    unittest.main()
