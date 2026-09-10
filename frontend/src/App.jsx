import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, isToday, isYesterday, subDays, subWeeks, subMonths } from 'date-fns';
import axios from 'axios';

const API = '/api';

// --- Utility Components ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-white/70 backdrop-blur-lg border border-white/50 shadow-xl rounded-2xl p-4 mb-4 ${className}`}>{children}</div>
);

const Button = ({ children, onClick, className = "", type = "button", disabled = false }) => (
  <button type={type} onClick={onClick} disabled={disabled} 
    className={`px-4 py-2 rounded-xl font-semibold text-white shadow-lg transition transform active:scale-95 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
    {children}
  </button>
);

const Input = ({ label, name, type = "text", value, onChange, required = false, placeholder = "" }) => {
  const isNumeric = ['units', 'level', 'dosage_units'].includes(name);
  return (
    <div className="mb-3">
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input 
        type={isNumeric ? "number" : type} 
        step={isNumeric ? "0.1" : undefined}
        inputMode={isNumeric ? "decimal" : undefined}
        name={name} value={value} onChange={onChange} required={required} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white outline-none transition-all duration-200 shadow-sm" 
      />
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState({ dosage: [], levels: [], food: [], currentDosage: [] });
  const [insulinTypes, setInsulinTypes] = useState([]);

  const fetchData = async () => {
    try {
      const [d, l, f, cd] = await Promise.all([
        axios.get(`${API}/dosage`), axios.get(`${API}/levels`), 
        axios.get(`${API}/food`), axios.get(`${API}/current_dosage`)
      ]);
      setData({ 
        dosage: Array.isArray(d.data) ? d.data : [], 
        levels: Array.isArray(l.data) ? l.data : [], 
        food: Array.isArray(f.data) ? f.data : [],
        currentDosage: Array.isArray(cd.data) ? cd.data : []
      });
    } catch (err) { console.error("Failed to fetch data", err); }
  };

  const fetchInsulinTypes = async () => {
    try {
      const res = await axios.get(`${API}/insulin_types`);
      setInsulinTypes(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error("Failed to fetch insulin types", err); }
  };

  useEffect(() => { fetchData(); fetchInsulinTypes(); }, []);

  const handleDelete = async (table, id) => {
    if(window.confirm("Delete this entry?")) { await axios.delete(`${API}/${table}/${id}`); fetchData(); }
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 shadow-lg sticky top-0 z-10">
        <h1 className="text-3xl font-extrabold text-center font-nunito tracking-wide drop-shadow-md">SugarScout</h1>
      </header>

      <main className="p-4 max-w-4xl mx-auto md:ml-64">
        {page === 'dashboard' && <Dashboard data={data} />}
        {page === 'current' && <CurrentDosagePage data={data.currentDosage} />}
        {page === 'log' && <UnifiedLog data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'dosage' && <EntryForm type="dosage" title="Log Insulin Dosage" fields={['units', 'insulin_type']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'levels' && <EntryForm type="levels" title="Log Insulin Levels" fields={['level']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'food' && <EntryForm type="food" title="Food Diary" fields={['meal_name']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'graphs' && <Graphs data={data} />}
        {page === 'admin' && <AdminPanel insulinTypes={insulinTypes} currentDosage={data.currentDosage} fetchInsulinTypes={fetchInsulinTypes} fetchData={fetchData} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/60 backdrop-blur-lg border-t border-white/40 flex justify-around p-2 md:hidden shadow-lg z-20">
        {[
          { id: 'dashboard', icon: '📊', label: 'Home' },
          { id: 'current', icon: '💊', label: 'Regimen' },
          { id: 'log', icon: '📝', label: 'Log' },
          { id: 'graphs', icon: '📈', label: 'Graphs' },
          { id: 'admin', icon: '⚙️', label: 'Admin' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)} 
            className={`flex flex-col items-center p-2 rounded-lg transition ${page === tab.id ? 'text-purple-700 bg-white/50' : 'text-gray-600'}`}>
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      <nav className="hidden md:flex fixed left-0 top-16 bottom-0 w-64 bg-white/60 backdrop-blur-lg border-r border-white/40 shadow-xl p-4 flex-col gap-2 z-10">
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'current', label: '💊 Current Regimen' },
          { id: 'dosage', label: '💉 Log Dosage' },
          { id: 'levels', label: '🩸 Log Levels' },
          { id: 'food', label: '🍎 Food Diary' },
          { id: 'graphs', label: '📈 Analytics' },
          { id: 'admin', label: '⚙️ Admin Settings' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)}
            className={`text-left px-4 py-3 rounded-xl font-medium transition ${page === tab.id ? 'bg-white/80 text-purple-700 shadow-md' : 'hover:bg-white/40 text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// --- Unified Log Page with Tabs (For Mobile) ---
function UnifiedLog({ data, insulinTypes, onSubmit, onDelete }) {
  const [activeTab, setActiveTab] = useState('dosage');
  
  const tabs = [
    { id: 'dosage', label: '💉 Dosage' },
    { id: 'levels', label: '🩸 Levels' },
    { id: 'food', label: '🍎 Food' }
  ];

  return (
    <div>
      <div className="flex bg-white/50 backdrop-blur-sm rounded-2xl p-1 mb-4 border border-white/50 shadow-md">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-2 rounded-xl font-semibold text-sm transition-all ${
              activeTab === tab.id 
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md' 
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dosage' && <EntryForm type="dosage" title="Log Insulin Dosage" fields={['units', 'insulin_type']} data={data} insulinTypes={insulinTypes} onSubmit={onSubmit} onDelete={onDelete} />}
      {activeTab === 'levels' && <EntryForm type="levels" title="Log Insulin Levels" fields={['level']} data={data} insulinTypes={insulinTypes} onSubmit={onSubmit} onDelete={onDelete} />}
      {activeTab === 'food' && <EntryForm type="food" title="Food Diary" fields={['meal_name']} data={data} insulinTypes={insulinTypes} onSubmit={onSubmit} onDelete={onDelete} />}
    </div>
  );
}

// --- Current Dosage Page ---
function CurrentDosagePage({ data }) {
  const totalDosageUnits = data.reduce((sum, item) => sum + (item.dosage_units || 0), 0);
  return (
    <div>
      <Card className="bg-gradient-to-br from-indigo-400/80 to-purple-600/80 text-white border-indigo-300/50 text-center">
        <h3 className="text-sm opacity-90">Total Daily Dosage</h3>
        <p className="text-4xl font-bold mt-1">{totalDosageUnits} Units</p>
      </Card>
      <h2 className="text-xl font-bold text-gray-800 mb-3 drop-shadow-sm">My Regimen</h2>
      {data.length === 0 ? (
        <Card><p className="text-gray-600 text-center py-4">No regimen set. Go to Admin Settings to add your dosages.</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map(item => (
            <Card key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <p className="text-lg font-bold text-gray-800">{item.name}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1">💉 {item.insulin_type}</p>
              </div>
              <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-xl text-center">
                <p className="text-2xl font-bold">{item.dosage_units}</p>
                <p className="text-xs font-semibold uppercase tracking-wide">Units</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Dashboard ---
function Dashboard({ data }) {
  const latestLevel = data.levels[0];
  const todayDosage = data.dosage.filter(d => new Date(d.timestamp).toDateString() === new Date().toDateString()).reduce((a, b) => a + (b.units || 0), 0);
  const [dashPage, setDashPage] = useState(0);
  const dashDaysPerPage = 2;

  const allEntries = [...data.dosage, ...data.levels, ...data.food].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const groupedEntries = allEntries.reduce((acc, item) => {
    const dateObj = new Date(item.timestamp);
    const dateKey = format(dateObj, 'yyyy-MM-dd');
    let label = format(dateObj, 'EEEE, MMM d, yyyy');
    if (isToday(dateObj)) label = 'Today';
    else if (isYesterday(dateObj)) label = 'Yesterday';
    if (!acc[dateKey]) acc[dateKey] = { label, items: [] };
    acc[dateKey].items.push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a));
  const totalPages = Math.ceil(sortedDates.length / dashDaysPerPage);
  const paginatedDates = sortedDates.slice(dashPage * dashDaysPerPage, (dashPage + 1) * dashDaysPerPage);

  useEffect(() => {
    if (totalPages === 0) setDashPage(0);
    else if (dashPage >= totalPages) setDashPage(totalPages - 1);
  }, [totalPages, dashPage]);

  const getEntryText = (item) => {
    if (item.units !== undefined) return `💉 ${item.units}u ${item.insulin_type}`;
    if (item.level !== undefined) return `🩸 ${item.level} mg/dL`;
    if (item.meal_name !== undefined) return `🍎 ${item.meal_name}`;
    return '';
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-400/80 to-blue-600/80 backdrop-blur-lg text-white border-blue-300/50">
          <h3 className="text-sm opacity-90">Latest Glucose</h3>
          <p className="text-3xl font-bold">{latestLevel ? `${latestLevel.level} mg/dL` : 'N/A'}</p>
        </Card>
        <Card className="bg-gradient-to-br from-pink-400/80 to-pink-600/80 backdrop-blur-lg text-white border-pink-300/50">
          <h3 className="text-sm opacity-90">Today's Logged Dosage</h3>
          <p className="text-3xl font-bold">{todayDosage} Units</p>
        </Card>
      </div>

      <h2 className="text-xl font-bold text-gray-800 mb-3 drop-shadow-sm">Recent Activity</h2>
      <Card>
        {allEntries.length === 0 ? (
          <p className="text-gray-600 text-center py-4">No recent activity.</p>
        ) : (
          <>
            {totalPages > 1 && (
              <div className="flex justify-between items-center mb-4 bg-white/50 backdrop-blur-sm p-2 rounded-xl border border-gray-200/50">
                <button onClick={() => setDashPage(p => p + 1)} disabled={dashPage >= totalPages - 1} className="px-4 py-2 rounded-lg font-semibold bg-white text-gray-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2">← Prev</button>
                <span className="text-sm font-bold text-purple-600">Page {dashPage + 1} of {totalPages}</span>
                <button onClick={() => setDashPage(p => p - 1)} disabled={dashPage === 0} className="px-4 py-2 rounded-lg font-semibold bg-white text-gray-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2">Next →</button>
              </div>
            )}
            <div className="space-y-6">
              {paginatedDates.map(dateKey => {
                const group = groupedEntries[dateKey];
                return (
                  <div key={dateKey}>
                    <h4 className="text-sm font-bold text-purple-600 uppercase tracking-wide mb-2 border-b border-purple-200/50 pb-1 sticky top-16 bg-white/50 backdrop-blur-sm z-10 -mt-1 pt-1">{group.label}</h4>
                    <ul className="divide-y divide-gray-200/50">
                      {group.items.map((item) => (
                        <li key={item.id} className="py-3 flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-gray-800">{getEntryText(item)}</p>
                            <p className="text-sm text-gray-600">{format(new Date(item.timestamp), 'h:mm a')}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// --- Entry Form ---
function EntryForm({ type, title, fields, data, insulinTypes, onSubmit, onDelete }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [formData, setFormData] = useState({});
  const [successMsg, setSuccessMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const daysPerPage = 2;

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (item) => {
    const d = new Date(item.timestamp);
    setDate(format(d, 'yyyy-MM-dd')); setTime(format(d, 'HH:mm'));
    const newData = {};
    fields.forEach(f => { newData[f] = (item[f] !== null && item[f] !== undefined) ? item[f] : ''; });
    newData.notes = item.notes || '';
    setFormData(newData); setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null); setFormData({});
    setDate(format(new Date(), 'yyyy-MM-dd')); setTime(format(new Date(), 'HH:mm'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSuccessMsg("");
    const payload = { timestamp: new Date(`${date}T${time}`).toISOString() };
    for (const [key, value] of Object.entries(formData)) {
      if (value === "" || value === undefined) payload[key] = null; 
      else if (['units', 'level'].includes(key)) payload[key] = parseFloat(value); 
      else payload[key] = value;
    }
    try {
      if (editingId) { await axios.put(`${API}/${type}/${editingId}`, payload); setSuccessMsg("Entry updated!"); handleCancelEdit(); }
      else { await axios.post(`${API}/${type}`, payload); setSuccessMsg("Entry saved!"); setFormData({}); setCurrentPage(0); }
      onSubmit(); setTimeout(() => setSuccessMsg(""), 3000);
    } catch (error) { alert("Error saving entry. Check inputs."); }
  };

  const getEntryText = (item) => {
    if (item.units !== undefined) return `${item.units}u ${item.insulin_type}`;
    if (item.level !== undefined) return `${item.level} mg/dL`;
    if (item.meal_name !== undefined) return item.meal_name;
    return '';
  };

  const recentEntries = data[type] || [];
  const groupedEntries = recentEntries.reduce((acc, item) => {
    const dateObj = new Date(item.timestamp);
    const dateKey = format(dateObj, 'yyyy-MM-dd');
    let label = format(dateObj, 'EEEE, MMM d, yyyy');
    if (isToday(dateObj)) label = 'Today';
    else if (isYesterday(dateObj)) label = 'Yesterday';
    if (!acc[dateKey]) acc[dateKey] = { label, items: [] };
    acc[dateKey].items.push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a));
  const totalPages = Math.ceil(sortedDates.length / daysPerPage);
  const paginatedDates = sortedDates.slice(currentPage * daysPerPage, (currentPage + 1) * daysPerPage);

  useEffect(() => {
    if (totalPages === 0) setCurrentPage(0);
    else if (currentPage >= totalPages) setCurrentPage(totalPages - 1);
  }, [totalPages, currentPage]);

  return (
    <div>
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
          {editingId && <button onClick={handleCancelEdit} className="text-sm text-red-500 font-semibold">Cancel Edit</button>}
        </div>
        {successMsg && <div className="bg-green-100/80 text-green-700 p-3 rounded-lg mb-4 text-center font-medium border border-green-200">{successMsg}</div>}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Input label="Date" name="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            <Input label="Time" name="time" type="time" value={time} onChange={e => setTime(e.target.value)} required />
          </div>
          {fields.map(field => {
            if (field === 'insulin_type') {
              return (
                <div className="mb-3" key={field}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">INSULIN TYPE</label>
                  <select name={field} value={formData[field] || ''} onChange={handleChange} required className="w-full px-3 py-2.5 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-purple-400 outline-none shadow-sm">
                    <option value="">Select type...</option>
                    {insulinTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
              );
            }
            return <Input key={field} label={field.replace('_', ' ').toUpperCase()} name={field} value={formData[field] !== undefined ? formData[field] : ''} onChange={handleChange} required={['units', 'level', 'meal_name'].includes(field)} placeholder={field === 'units' || field === 'level' ? "e.g. 6.1" : ""} />;
          })}
          <Input label="Notes (Optional)" name="notes" value={formData.notes || ''} onChange={handleChange} />
          <Button type="submit" className={`w-full mt-2 ${editingId ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}>
            {editingId ? 'Update Entry' : 'Save Entry'}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-gray-800 mb-3">All Entries</h3>
        {recentEntries.length === 0 ? (
          <p className="text-gray-600 text-center py-4">No entries yet.</p>
        ) : (
          <>
            {totalPages > 1 && (
              <div className="flex justify-between items-center mb-4 bg-white/50 backdrop-blur-sm p-2 rounded-xl border border-gray-200/50">
                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1} className="px-4 py-2 rounded-lg font-semibold bg-white text-gray-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2">← Prev</button>
                <span className="text-sm font-bold text-purple-600">Page {currentPage + 1} of {totalPages}</span>
                <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 0} className="px-4 py-2 rounded-lg font-semibold bg-white text-gray-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2">Next →</button>
              </div>
            )}
            <div className="space-y-6">
              {paginatedDates.map(dateKey => {
                const group = groupedEntries[dateKey];
                return (
                  <div key={dateKey}>
                    <h4 className="text-sm font-bold text-purple-600 uppercase tracking-wide mb-2 border-b border-purple-200/50 pb-1 sticky top-16 bg-white/50 backdrop-blur-sm z-10 -mt-1 pt-1">{group.label}</h4>
                    <ul className="divide-y divide-gray-200/50">
                      {group.items.map((item) => (
                        <li key={item.id} className="py-3 flex justify-between items-center">
                          <div className="flex-1 mr-2">
                            <p className="font-semibold text-gray-800">{getEntryText(item)}</p>
                            <p className="text-sm text-gray-600">{format(new Date(item.timestamp), 'h:mm a')}</p>
                            {item.notes && <p className="text-xs text-gray-500 italic mt-1">Note: {item.notes}</p>}
                          </div>
                          <div className="flex gap-2 items-center">
                            <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 text-xl" title="Edit">✏️</button>
                            <button onClick={() => onDelete(type, item.id)} className="text-red-500 hover:text-red-700 text-xl" title="Delete">✕</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// --- Admin Panel ---
function AdminPanel({ insulinTypes, currentDosage, fetchInsulinTypes, fetchData }) {
  const [newTypeName, setNewTypeName] = useState("");
  const [newDosageName, setNewDosageName] = useState("");
  const [newDosageType, setNewDosageType] = useState("");
  const [newDosageUnits, setNewDosageUnits] = useState("");
  const [msg, setMsg] = useState("");
  const [editingRegimenId, setEditingRegimenId] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleEditRegimen = (dose) => {
    setEditingRegimenId(dose.id); setNewDosageName(dose.name); setNewDosageType(dose.insulin_type); setNewDosageUnits(dose.dosage_units.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleCancelEditRegimen = () => { setEditingRegimenId(null); setNewDosageName(""); setNewDosageType(""); setNewDosageUnits(""); };

  const handleAddCurrentDosage = async (e) => {
    e.preventDefault();
    if (!newDosageName.trim() || !newDosageType || !newDosageUnits) return;
    const payload = { name: newDosageName.trim(), insulin_type: newDosageType, dosage_units: parseFloat(newDosageUnits) };
    try {
      if (editingRegimenId) { await axios.put(`${API}/current_dosage/${editingRegimenId}`, payload); setMsg("Regimen updated!"); handleCancelEditRegimen(); }
      else { await axios.post(`${API}/current_dosage`, payload); setMsg("Dosage added!"); handleCancelEditRegimen(); }
      fetchData(); setTimeout(() => setMsg(""), 2000);
    } catch (err) { alert("Error saving regimen"); }
  };

  const handleDeleteCurrentDosage = async (id, name) => { if (window.confirm(`Remove "${name}" from regimen?`)) { await axios.delete(`${API}/current_dosage/${id}`); fetchData(); } };
  const handleAddType = async (e) => {
    e.preventDefault(); if (!newTypeName.trim()) return;
    try { await axios.post(`${API}/insulin_types`, { name: newTypeName.trim() }); setNewTypeName(""); fetchInsulinTypes(); setMsg("Insulin type added!"); setTimeout(() => setMsg(""), 2000); }
    catch (err) { alert(err.response?.data?.detail || "Error"); }
  };
  const handleDeleteType = async (id, name) => { if (window.confirm(`Delete "${name}"?`)) { await axios.delete(`${API}/insulin_types/${id}`); fetchInsulinTypes(); } };

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API}/export`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `sugarscout_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
      setMsg("Data exported!"); setTimeout(() => setMsg(""), 3000);
    } catch (error) { alert("Failed to export"); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!window.confirm(`WARNING: Importing in ${importMode.toUpperCase()} mode. Continue?`)) { fileInputRef.current.value = ''; return; }
    setIsImporting(true);
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await axios.post(`${API}/import?mode=${importMode}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg(response.data.message || "Imported!"); fetchData(); fetchInsulinTypes(); setTimeout(() => setMsg(""), 5000);
    } catch (error) { alert(error.response?.data?.detail || "Failed to import"); } 
    finally { setIsImporting(false); fileInputRef.current.value = ''; }
  };

  return (
    <div>
      {msg && <div className="bg-green-100/80 text-green-700 p-3 rounded-lg mb-4 text-center font-medium border border-green-200">{msg}</div>}
      <Card className="border-2 border-purple-300">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">💾 Backup & Restore</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 p-4 rounded-xl">
            <h3 className="text-lg font-bold text-blue-800 mb-2">📤 Export Data</h3>
            <p className="text-sm text-gray-600 mb-4">Download all your data as a JSON backup.</p>
            <Button onClick={handleExport} className="w-full bg-gradient-to-r from-blue-500 to-cyan-600">Download Backup</Button>
          </div>
          <div className="bg-green-50/50 p-4 rounded-xl">
            <h3 className="text-lg font-bold text-green-800 mb-2">📥 Import Data</h3>
            <p className="text-sm text-gray-600 mb-3">Restore from a backup file.</p>
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Import Mode:</label>
              <div className="flex gap-2">
                <button onClick={() => setImportMode("merge")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${importMode === 'merge' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>Merge</button>
                <button onClick={() => setImportMode("replace")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${importMode === 'replace' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>Replace</button>
              </div>
            </div>
            <input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} disabled={isImporting} className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-100 file:text-green-700 hover:file:bg-green-200 disabled:opacity-50" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-gray-800">💊 Regimen Setup</h2>
          {editingRegimenId && <button onClick={handleCancelEditRegimen} className="text-sm text-red-500 font-semibold">Cancel Edit</button>}
        </div>
        <p className="text-gray-600 mb-4">{editingRegimenId ? "Editing existing regimen entry..." : "Add your specific insulin dosages here."}</p>
        <form onSubmit={handleAddCurrentDosage} className="flex flex-col gap-3 mb-6">
          <Input label="DOSAGE NAME" name="dosage_name" type="text" value={newDosageName} onChange={e => setNewDosageName(e.target.value)} placeholder="e.g. Breakfast" required />
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">INSULIN TYPE</label>
            <select value={newDosageType} onChange={e => setNewDosageType(e.target.value)} required className="w-full px-3 py-2.5 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-purple-400 outline-none shadow-sm">
              <option value="">Select Insulin Type...</option>
              {insulinTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <Input label="DOSAGE UNITS" name="dosage_units" type="number" value={newDosageUnits} onChange={e => setNewDosageUnits(e.target.value)} placeholder="e.g. 10.5" required />
          <Button type="submit" className={`w-full ${editingRegimenId ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-600'}`}>
            {editingRegimenId ? 'Update Regimen Entry' : 'Add to Regimen'}
          </Button>
        </form>
        <h3 className="text-lg font-bold text-gray-800 mb-3">Current Regimen</h3>
        {currentDosage.length === 0 ? <p className="text-gray-500 text-center py-2">No dosages set.</p> : (
          <ul className="divide-y divide-gray-200/50">
            {currentDosage.map(dose => (
              <li key={dose.id} className="py-3 flex justify-between items-center">
                <div>
                  <span className="font-bold text-gray-800 block">{dose.name}</span>
                  <span className="text-sm text-gray-500">💉 {dose.insulin_type} - {dose.dosage_units} Units</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEditRegimen(dose)} className="text-blue-500 hover:text-blue-700 text-xl">✏️</button>
                  <button onClick={() => handleDeleteCurrentDosage(dose.id, dose.name)} className="text-red-500 hover:text-red-700 text-xl">✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">⚙️ Insulin Types</h2>
        <p className="text-gray-600 mb-4">Manage the master list of insulin types.</p>
        <form onSubmit={handleAddType} className="flex gap-2 mb-6">
          <input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="e.g. Novorapid, Lantus..." className="flex-1 px-3 py-2.5 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-purple-400 outline-none shadow-sm" required />
          <Button type="submit" className="bg-gradient-to-r from-blue-500 to-indigo-600">Add Type</Button>
        </form>
        <h3 className="text-lg font-bold text-gray-800 mb-3">Master List</h3>
        {insulinTypes.length === 0 ? <p className="text-gray-500 text-center py-2">No types created yet.</p> : (
          <ul className="divide-y divide-gray-200/50">
            {insulinTypes.map(type => (
              <li key={type.id} className="py-3 flex justify-between items-center">
                <span className="font-medium text-gray-800">💉 {type.name}</span>
                <button onClick={() => handleDeleteType(type.id, type.name)} className="text-red-500 hover:text-white hover:bg-red-500 text-sm font-semibold px-3 py-1 rounded-lg transition border border-red-500">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// --- Graphs (FIXED: Chronological sorting for ALL views) ---
function Graphs({ data }) {
  const [range, setRange] = useState('1W');
  
  // FIXED: Always returns data sorted chronologically (oldest to newest)
  const filterData = (items) => {
    const now = new Date();
    let limit;
    
    if (range === '1D') limit = subDays(now, 1);
    else if (range === '1W') limit = subWeeks(now, 1);
    else if (range === '1M') limit = subMonths(now, 1);

    // Filter by date if a limit is set, otherwise use all items
    const filteredItems = limit 
      ? items.filter(i => new Date(i.timestamp) >= limit) 
      : items;

    // Sort chronologically (oldest on left, newest on right)
    // Using sort() instead of reverse() ensures it works perfectly for the "ALL" view too
    return [...filteredItems].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  const levelData = filterData(data.levels).map(i => ({ time: format(new Date(i.timestamp), 'MM/dd HH:mm'), level: i.level }));
  const dosageData = filterData(data.dosage).map(i => ({ time: format(new Date(i.timestamp), 'MM/dd HH:mm'), units: i.units }));

  return (
    <div>
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Analytics</h2>
          <div className="flex gap-2">
            {['1D', '1W', '1M', 'ALL'].map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-lg text-sm font-medium transition ${range === r ? 'bg-purple-600 text-white shadow-md' : 'bg-white/50 text-gray-700 hover:bg-white/80'}`}>{r}</button>
            ))}
          </div>
        </div>
        <h3 className="font-semibold text-gray-700 mb-2">Insulin Levels (mg/dL)</h3>
        <div className="h-64 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={levelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis domain={['auto', 'auto']} stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid #e5e7eb', backdropFilter: 'blur(4px)' }} />
              <Line type="monotone" dataKey="level" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <h3 className="font-semibold text-gray-700 mb-2">Logged Insulin Dosage (Units)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dosageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis domain={['auto', 'auto']} stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid #e5e7eb', backdropFilter: 'blur(4px)' }} />
              <Bar dataKey="units" fill="#ec4899" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}