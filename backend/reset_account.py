"""Reset the local login account without touching tracker data."""
import argparse

from main import SessionLocal, User


def main():
    parser = argparse.ArgumentParser(description="Reset the SugarScout local account")
    parser.add_argument("--reset-account", action="store_true", help="Delete the login account, not tracker data")
    args = parser.parse_args()
    if not args.reset_account:
        parser.error("Pass --reset-account to confirm this action")

    db = SessionLocal()
    try:
        removed = db.query(User).delete()
        db.commit()
        print(f"Removed {removed} local account(s). Health data was not changed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
