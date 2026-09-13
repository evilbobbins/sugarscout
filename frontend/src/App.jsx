import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
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
  const isNumeric = ['units', 'level', 'dosage_units', 'carbs'].includes(name);
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
  const [data, setData] = useState({ dosage: [], levels: [], food: [], currentDosage: [], reminders: [], settings: { glucose_unit: 'mg/dL', target_low: null, target_high: null } });
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [auth, setAuth] = useState({ loading: true, setupRequired: false, authenticated: false });
  const [apiError, setApiError] = useState('');

  const checkAuth = async () => {
    try {
      const response = await axios.get(`${API}/auth/status`);
      setAuth({ loading: false, setupRequired: response.data.setup_required, authenticated: response.data.authenticated });
    } catch { setAuth({ loading: false, setupRequired: false, authenticated: false }); }
  };

  const fetchData = async () => {
    try {
      const [d, l, f, cd, reminders, settings] = await Promise.all([
        axios.get(`${API}/dosage`), axios.get(`${API}/levels`), 
        axios.get(`${API}/food`), axios.get(`${API}/current_dosage`), axios.get(`${API}/reminders`), axios.get(`${API}/settings`)
      ]);
      setData({ 
        dosage: Array.isArray(d.data) ? d.data : [], 
        levels: Array.isArray(l.data) ? l.data : [], 
        food: Array.isArray(f.data) ? f.data : [],
        currentDosage: Array.isArray(cd.data) ? cd.data : [],
        reminders: Array.isArray(reminders.data) ? reminders.data : [],
        settings: settings.data
      });
      setApiError('');
    } catch (err) { setApiError(err.response?.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unable to load your data. Check that the server is running.'); }
  };

  const fetchInsulinTypes = async () => {
    try {
      const res = await axios.get(`${API}/insulin_types`);
      setInsulinTypes(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error("Failed to fetch insulin types", err); }
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (auth.authenticated) { fetchData(); fetchInsulinTypes(); } }, [auth.authenticated]);
  useEffect(() => {
    const checkReminders = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = new Date(); const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]; const time = format(now, 'HH:mm');
      data.reminders.filter(r => r.enabled && r.reminder_time === time && r.days.split(',').includes(day)).forEach(r => {
        const key = `sugarscout-reminder-${r.id}-${format(now, 'yyyy-MM-dd')}`;
        if (!localStorage.getItem(key)) { new Notification('SugarScout reminder', { body: r.title }); localStorage.setItem(key, '1'); }
      });
    };
    checkReminders(); const timer = setInterval(checkReminders, 30000); return () => clearInterval(timer);
  }, [data.reminders]);

  const handleDelete = async (table, id) => {
    if(window.confirm("Delete this entry?")) {
      try { await axios.delete(`${API}/${table}/${id}`); fetchData(); }
      catch { setApiError('Could not delete the entry. Please try again.'); }
    }
  };

  const handleLogout = async () => { await axios.post(`${API}/auth/logout`); setAuth({ loading: false, setupRequired: false, authenticated: false }); };

  if (auth.loading) return <div className="min-h-screen flex items-center justify-center text-gray-700 font-semibold">Loading SugarScout…</div>;
  if (!auth.authenticated) return <AuthScreen setupRequired={auth.setupRequired} onAuthenticated={checkAuth} />;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="h-20 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 shadow-lg sticky top-0 z-30 flex items-center">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/sugarscout-mark.png" alt="SugarScout" className="w-11 h-11 object-contain drop-shadow-md" />
            <h1 className="text-3xl font-extrabold font-nunito tracking-wide drop-shadow-md">SugarScout</h1>
          </div>
          <button onClick={handleLogout} className="text-sm font-semibold rounded-lg px-3 py-2 hover:bg-white/20">Sign out</button>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto md:ml-72">
        {apiError && <div role="alert" className="bg-red-100 text-red-800 border border-red-200 rounded-xl p-3 mb-4">{apiError}</div>}
        {page === 'dashboard' && <Dashboard data={data} glucoseUnit={data.settings.glucose_unit} />}
        {page === 'current' && <CurrentDosagePage data={data.currentDosage} />}
        {page === 'log' && <UnifiedLog data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'dosage' && <EntryForm type="dosage" title="Log Insulin Dosage" fields={['units', 'insulin_type']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'levels' && <EntryForm type="levels" title="Log Blood Glucose" fields={['level']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} glucoseUnit={data.settings.glucose_unit} />}
        {page === 'food' && <EntryForm type="food" title="Food Diary" fields={['meal_name', 'carbs', 'serving_size', 'tags']} data={data} insulinTypes={insulinTypes} onSubmit={fetchData} onDelete={handleDelete} />}
        {page === 'graphs' && <Graphs data={data} glucoseUnit={data.settings.glucose_unit} />}
        {page === 'admin' && <AdminPanel insulinTypes={insulinTypes} currentDosage={data.currentDosage} settings={data.settings} reminders={data.reminders} fetchInsulinTypes={fetchInsulinTypes} fetchData={fetchData} />}
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

      <nav aria-label="Main navigation" className="hidden md:flex fixed left-0 top-20 bottom-0 w-72 bg-white/55 backdrop-blur-2xl border-r border-white/60 shadow-2xl p-4 flex-col z-20">
        <div className="rounded-2xl p-4 mb-5 bg-gradient-to-br from-purple-600 to-pink-500 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">Your health journal</p>
          <p className="text-lg font-extrabold mt-1">Good to see you</p>
          <p className="text-sm opacity-90 mt-1">Log the little details that matter.</p>
        </div>
        <SidebarSection title="Overview" page={page} setPage={setPage} tabs={[
          { id: 'dashboard', icon: '▦', label: 'Dashboard' },
          { id: 'current', icon: '◈', label: 'Current regimen' },
          { id: 'graphs', icon: '⌁', label: 'Insights & trends' }
        ]} />
        <SidebarSection title="Track" page={page} setPage={setPage} tabs={[
          { id: 'dosage', icon: '＋', label: 'Log insulin' },
          { id: 'levels', icon: '♥', label: 'Log blood glucose' },
          { id: 'food', icon: '◌', label: 'Food & carbohydrates' }
        ]} />
        <div className="mt-auto pt-4 border-t border-white/70"><SidebarSection title="Manage" page={page} setPage={setPage} tabs={[{ id: 'admin', icon: '⚙', label: 'Settings & backup' }]} /></div>
      </nav>
    </div>
  );
}

function SidebarSection({ title, tabs, page, setPage }) {
  return <div className="mb-5">
    <p className="px-3 mb-2 text-[11px] uppercase font-extrabold tracking-[0.16em] text-gray-500">{title}</p>
    <div className="space-y-1">{tabs.map(tab => <button key={tab.id} onClick={() => setPage(tab.id)} aria-current={page === tab.id ? 'page' : undefined}
      className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all duration-200 ${page === tab.id ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-300/60 translate-x-1' : 'text-gray-700 hover:bg-white/70 hover:translate-x-0.5'}`}>
      <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-base ${page === tab.id ? 'bg-white/20' : 'bg-purple-100 text-purple-700'}`}>{tab.icon}</span>{tab.label}
    </button>)}</div>
  </div>;
}

function AuthScreen({ setupRequired, onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { await axios.post(`${API}/auth/${setupRequired ? 'setup' : 'login'}`, { username, password, remember_me: rememberMe }); await onAuthenticated(); }
    catch (err) { setError(err.response?.data?.detail || 'Unable to sign in. Please try again.'); }
    finally { setSubmitting(false); }
  };
  return <div className="min-h-screen p-4 flex items-center justify-center"><Card className="w-full max-w-md mb-0">
    <h1 className="text-3xl font-extrabold text-gray-800 mb-2">SugarScout</h1>
    <p className="text-gray-600 mb-6">{setupRequired ? 'Create the local account that protects this tracker.' : 'Sign in to your private tracker.'}</p>
    {error && <div role="alert" className="bg-red-100 text-red-800 border border-red-200 rounded-xl p-3 mb-4">{error}</div>}
    <form onSubmit={submit}>
      <Input label="USERNAME" value={username} onChange={e => setUsername(e.target.value)} required />
      <Input label="PASSWORD" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      {!setupRequired && <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 accent-purple-600" /> Remember me on this device <span className="font-normal text-gray-500">(30 days)</span></label>}
      {setupRequired && <p className="text-xs text-gray-500 mb-4">Use at least 10 characters. Your password is stored as a secure hash.</p>}
      <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-purple-500 to-pink-500">{submitting ? 'Please wait…' : setupRequired ? 'Create account' : 'Sign in'}</Button>
    </form>
  </Card></div>;
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
      {activeTab === 'levels' && <EntryForm type="levels" title="Log Blood Glucose" fields={['level']} data={data} insulinTypes={insulinTypes} onSubmit={onSubmit} onDelete={onDelete} glucoseUnit={data.settings.glucose_unit} />}
      {activeTab === 'food' && <EntryForm type="food" title="Food Diary" fields={['meal_name', 'carbs', 'serving_size', 'tags']} data={data} insulinTypes={insulinTypes} onSubmit={onSubmit} onDelete={onDelete} />}
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
function Dashboard({ data, glucoseUnit }) {
  const latestLevel = data.levels[0];
  const todayDosage = data.dosage.filter(d => new Date(d.timestamp).toDateString() === new Date().toDateString()).reduce((a, b) => a + (b.units || 0), 0);
  const todayFood = data.food.filter(f => new Date(f.timestamp).toDateString() === new Date().toDateString());
  const todayCarbs = todayFood.reduce((sum, item) => sum + (item.carbs || 0), 0);
  const glucoseStatus = latestLevel && data.settings.target_low && data.settings.target_high ? (latestLevel.level < data.settings.target_low ? 'Below target' : latestLevel.level > data.settings.target_high ? 'Above target' : 'Within target') : null;
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
    if (item.level !== undefined) return `🩸 ${item.level} ${glucoseUnit}`;
    if (item.meal_name !== undefined) return `🍎 ${item.meal_name}`;
    return '';
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-400/80 to-blue-600/80 backdrop-blur-lg text-white border-blue-300/50">
          <h3 className="text-sm opacity-90">Latest Blood Glucose</h3>
          <p className="text-3xl font-bold">{latestLevel ? `${latestLevel.level} ${glucoseUnit}` : 'N/A'}</p>
          {glucoseStatus && <p className="text-sm mt-1">{glucoseStatus} (your personal range)</p>}
        </Card>
        <Card className="bg-gradient-to-br from-pink-400/80 to-pink-600/80 backdrop-blur-lg text-white border-pink-300/50">
          <h3 className="text-sm opacity-90">Today's Logged Dosage</h3>
          <p className="text-3xl font-bold">{todayDosage} Units</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-xl font-bold text-gray-800 mb-3">Today’s Summary</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="text-2xl font-bold text-purple-700">{todayDosage}</p><p className="text-xs text-gray-600">Insulin units</p></div>
          <div><p className="text-2xl font-bold text-pink-700">{todayCarbs}g</p><p className="text-xs text-gray-600">Carbohydrates</p></div>
          <div><p className="text-2xl font-bold text-blue-700">{data.levels.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length}</p><p className="text-xs text-gray-600">Glucose checks</p></div>
        </div>
      </Card>

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
function EntryForm({ type, title, fields, data, insulinTypes, onSubmit, onDelete, glucoseUnit = 'mg/dL' }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [formData, setFormData] = useState({});
  const [successMsg, setSuccessMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [search, setSearch] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const daysPerPage = 2;

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (item) => {
    const d = new Date(item.timestamp);
    setDate(format(d, 'yyyy-MM-dd')); setTime(format(d, 'HH:mm'));
    const newData = {};
    fields.forEach(f => { newData[f] = (item[f] !== null && item[f] !== undefined) ? item[f] : ''; });
    newData.notes = item.notes || '';
    setFormData(newData); setEditingId(item.id); setManualExpanded(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null); setFormData({}); setManualExpanded(false);
    setDate(format(new Date(), 'yyyy-MM-dd')); setTime(format(new Date(), 'HH:mm'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSuccessMsg("");
    const payload = { timestamp: new Date(`${date}T${time}`).toISOString() };
    for (const [key, value] of Object.entries(formData)) {
      if (value === "" || value === undefined) payload[key] = null; 
      else if (['units', 'level', 'carbs'].includes(key)) payload[key] = parseFloat(value);
      else payload[key] = value;
    }
    try {
      if (editingId) { await axios.put(`${API}/${type}/${editingId}`, payload); setSuccessMsg("Entry updated!"); handleCancelEdit(); }
      else { await axios.post(`${API}/${type}`, payload); setSuccessMsg("Entry saved!"); setFormData({}); setCurrentPage(0); if (type === 'dosage') setManualExpanded(false); }
      onSubmit(); setTimeout(() => setSuccessMsg(""), 3000);
    } catch (error) { alert("Error saving entry. Check inputs."); }
  };

  const handlePresetLog = async (dose) => {
    if (!window.confirm(`Log ${dose.dosage_units} units of ${dose.insulin_type} for ${dose.name} now?`)) return;
    try {
      await axios.post(`${API}/dosage`, { timestamp: new Date().toISOString(), units: dose.dosage_units, insulin_type: dose.insulin_type, notes: `Regimen preset: ${dose.name}` });
      setSuccessMsg(`${dose.name} logged!`); onSubmit(); setTimeout(() => setSuccessMsg(''), 3000);
    } catch { setSuccessMsg('Could not log the preset. Please try again.'); }
  };

  const handleReuseFood = async (item) => {
    if (!window.confirm(`Log “${item.meal_name}” again now?`)) return;
    try {
      await axios.post(`${API}/food`, { timestamp: new Date().toISOString(), meal_name: item.meal_name, carbs: item.carbs, serving_size: item.serving_size, tags: item.tags, notes: item.notes });
      setSuccessMsg(`${item.meal_name} logged again!`); onSubmit(); setTimeout(() => setSuccessMsg(''), 3000);
    } catch { setSuccessMsg('Could not reuse this food entry. Please try again.'); }
  };

  const getEntryText = (item) => {
    if (item.units !== undefined) return `${item.units}u ${item.insulin_type}`;
    if (item.level !== undefined) return `${item.level} ${glucoseUnit}`;
    if (item.meal_name !== undefined) return `${item.meal_name}${item.carbs !== null && item.carbs !== undefined ? ` · ${item.carbs}g carbs` : ''}`;
    return '';
  };

  const recentEntries = (data[type] || []).filter(item => JSON.stringify(item).toLowerCase().includes(search.toLowerCase()));
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
          {type === 'dosage' && data.currentDosage.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2"><label className="text-sm font-bold text-gray-700">REGIMEN PRESETS</label><span className="text-xs text-gray-500">Tap to prefill</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.currentDosage.map(dose => <button key={dose.id} type="button" onClick={() => handlePresetLog(dose)}
                  className="text-left rounded-xl p-3 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-400 transition focus-visible:outline-purple-600">
                  <span className="block font-bold text-purple-800">Log {dose.name}</span><span className="text-sm text-purple-700">{dose.dosage_units} units · {dose.insulin_type}</span>
                </button>)}
              </div>
            </div>
          )}
          {type === 'dosage' && !editingId && <button type="button" onClick={() => setManualExpanded(open => !open)} aria-expanded={manualExpanded}
            className="w-full flex items-center justify-between rounded-xl px-4 py-3 mb-4 bg-white/70 border border-purple-200 text-purple-800 font-bold hover:bg-purple-50 transition">
            <span>Manual insulin entry</span><span aria-hidden="true" className="text-xl">{manualExpanded ? '⌃' : '⌄'}</span>
          </button>}
          {(type !== 'dosage' || manualExpanded || editingId) && <>
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
            const label = field === 'level' ? `BLOOD GLUCOSE (${glucoseUnit})` : field === 'carbs' ? 'CARBOHYDRATES (g)' : field.replace('_', ' ').toUpperCase();
            return <Input key={field} label={label} name={field} value={formData[field] !== undefined ? formData[field] : ''} onChange={handleChange} required={['units', 'level', 'meal_name'].includes(field)} placeholder={field === 'units' || field === 'level' ? "e.g. 6.1" : ""} />;
          })}
          <Input label="Notes (Optional)" name="notes" value={formData.notes || ''} onChange={handleChange} />
          <Button type="submit" className={`w-full mt-2 ${editingId ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}>
            {editingId ? 'Update Entry' : 'Save Entry'}
          </Button>
          </>}
        </form>
      </Card>

      <Card>
        <button type="button" onClick={() => setHistoryExpanded(open => !open)} aria-expanded={historyExpanded} className="w-full flex justify-between items-center text-left text-lg font-bold text-gray-800 mb-3">
          <span>All Entries <span className="text-sm font-medium text-gray-500">(tap to {historyExpanded ? 'hide' : 'show'})</span></span><span aria-hidden="true">{historyExpanded ? '⌃' : '⌄'}</span>
        </button>
        {historyExpanded && <>
        <input aria-label="Search entries" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(0); }} placeholder="Search entries, notes, or tags…" className="w-full px-3 py-2 mb-4 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-purple-400 outline-none" />
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
                            {type === 'food' && <button onClick={() => handleReuseFood(item)} className="text-purple-700 hover:text-purple-900 text-sm font-bold px-2 py-1 rounded-lg bg-purple-100" title="Log this meal again">Reuse</button>}
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
        </>}
      </Card>
    </div>
  );
}

// --- Admin Panel ---
function AdminPanel({ insulinTypes, currentDosage, settings, reminders, fetchInsulinTypes, fetchData }) {
  const [newTypeName, setNewTypeName] = useState("");
  const [newDosageName, setNewDosageName] = useState("");
  const [newDosageType, setNewDosageType] = useState("");
  const [newDosageUnits, setNewDosageUnits] = useState("");
  const [msg, setMsg] = useState("");
  const [editingRegimenId, setEditingRegimenId] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [glucoseUnit, setGlucoseUnit] = useState(settings.glucose_unit);
  const [targetLow, setTargetLow] = useState(settings.target_low ?? '');
  const [targetHigh, setTargetHigh] = useState(settings.target_high ?? '');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleCsvExport = async () => {
    try {
      const response = await axios.get(`${API}/export.csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a'); link.href = url; link.download = `sugarscout_export_${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click(); window.URL.revokeObjectURL(url);
    } catch { setMsg('Failed to export CSV.'); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!window.confirm(`WARNING: Importing in ${importMode.toUpperCase()} mode. Continue?`)) { fileInputRef.current.value = ''; return; }
    setIsImporting(true);
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await axios.post(`${API}/import?mode=${importMode}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const summary = response.data.skipped ? ` (${response.data.added} added, ${response.data.skipped} already present)` : '';
      setMsg((response.data.message || "Imported!") + summary); fetchData(); fetchInsulinTypes(); setTimeout(() => setMsg(""), 5000);
    } catch (error) { alert(error.response?.data?.detail || "Failed to import"); } 
    finally { setIsImporting(false); fileInputRef.current.value = ''; }
  };

  const handleGlucoseUnit = async (event) => {
    const unit = event.target.value;
    if (unit !== settings.glucose_unit && !window.confirm('This changes labels only; existing readings are not converted. Continue?')) return;
    try { await axios.put(`${API}/settings`, { glucose_unit: unit, target_low: targetLow === '' ? null : parseFloat(targetLow), target_high: targetHigh === '' ? null : parseFloat(targetHigh) }); setGlucoseUnit(unit); fetchData(); setMsg('Glucose unit updated.'); setTimeout(() => setMsg(''), 3000); }
    catch { setMsg('Could not update the glucose unit.'); }
  };

  const saveTargets = async (event) => {
    event.preventDefault();
    try { await axios.put(`${API}/settings`, { glucose_unit: glucoseUnit, target_low: targetLow === '' ? null : parseFloat(targetLow), target_high: targetHigh === '' ? null : parseFloat(targetHigh) }); fetchData(); setMsg('Personal target range updated.'); }
    catch (error) { setMsg(error.response?.data?.detail || 'Could not save the target range.'); }
  };
  const addReminder = async (event) => {
    event.preventDefault();
    try { await axios.post(`${API}/reminders`, { title: reminderTitle, reminder_time: reminderTime, days: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', enabled: true }); setReminderTitle(''); setReminderTime(''); fetchData(); setMsg('Daily reminder added.'); }
    catch { setMsg('Could not add the reminder.'); }
  };
  const requestNotifications = async () => { if ('Notification' in window) { await Notification.requestPermission(); setMsg(`Notifications: ${Notification.permission}.`); } else setMsg('This browser does not support notifications.'); };
  const deleteRange = async (table) => {
    const start = window.prompt('Start date (YYYY-MM-DD):'); const end = window.prompt('End date (YYYY-MM-DD):');
    if (!start || !end || !window.confirm(`Delete all ${table} entries from ${start} through ${end}? This cannot be undone.`)) return;
    try { const r = await axios.post(`${API}/delete-by-date`, { table, start: `${start}T00:00:00`, end: `${end}T23:59:59` }); fetchData(); setMsg(`${r.data.count} entries deleted.`); } catch { setMsg('Could not delete entries.'); }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setMsg('The new passwords do not match.'); return; }
    try {
      await axios.post(`${API}/auth/change-password`, { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMsg('Password changed successfully.'); setTimeout(() => setMsg(''), 3000);
    } catch (error) { setMsg(error.response?.data?.detail || 'Could not change the password.'); }
  };

  return (
    <div>
      {msg && <div className="bg-green-100/80 text-green-700 p-3 rounded-lg mb-4 text-center font-medium border border-green-200">{msg}</div>}
      <Card>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🩸 Blood Glucose Unit</h2>
        <p className="text-gray-600 mb-4">Choose the unit used when entering and displaying glucose readings. Existing values are never converted automatically.</p>
        <select value={glucoseUnit} onChange={handleGlucoseUnit} className="w-full px-3 py-2.5 bg-white/90 border-2 border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-purple-400 outline-none shadow-sm">
          <option value="mg/dL">mg/dL</option>
          <option value="mmol/L">mmol/L</option>
        </select>
        <form onSubmit={saveTargets} className="grid grid-cols-2 gap-3 mt-4">
          <Input label={`LOW TARGET (${glucoseUnit})`} name="targetLow" value={targetLow} onChange={e => setTargetLow(e.target.value)} />
          <Input label={`HIGH TARGET (${glucoseUnit})`} name="targetHigh" value={targetHigh} onChange={e => setTargetHigh(e.target.value)} />
          <Button type="submit" className="col-span-2 bg-gradient-to-r from-green-500 to-emerald-600">Save Personal Target Range</Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🔔 Daily Reminders</h2>
        <p className="text-gray-600 mb-3">Notifications fire while SugarScout is open in your browser.</p>
        <Button onClick={requestNotifications} className="w-full mb-4 bg-gradient-to-r from-blue-500 to-indigo-600">Enable Browser Notifications</Button>
        <form onSubmit={addReminder} className="grid grid-cols-2 gap-3"><Input label="REMINDER" name="reminder" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} required /><Input label="TIME" name="reminder_time" type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} required /><Button type="submit" className="col-span-2 bg-gradient-to-r from-purple-500 to-pink-500">Add Daily Reminder</Button></form>
        <ul className="mt-4 divide-y divide-gray-200/50">{reminders.map(r => <li key={r.id} className="py-2 flex justify-between"><span>{r.reminder_time} · {r.title}</span><button aria-label={`Delete ${r.title}`} onClick={async () => { await axios.delete(`${API}/reminders/${r.id}`); fetchData(); }} className="text-red-600">Delete</button></li>)}</ul>
      </Card>
      <Card>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🔐 Change Password</h2>
        <p className="text-gray-600 mb-4">Use a new password with at least 10 characters.</p>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-1">
          <Input label="CURRENT PASSWORD" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
          <Input label="NEW PASSWORD" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
          <Input label="CONFIRM NEW PASSWORD" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-pink-500">Change Password</Button>
        </form>
      </Card>
      <Card className="border-2 border-purple-300">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">💾 Backup & Restore</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 p-4 rounded-xl">
            <h3 className="text-lg font-bold text-blue-800 mb-2">📤 Export Data</h3>
            <p className="text-sm text-gray-600 mb-4">Download all your data as a JSON backup.</p>
            <Button onClick={handleExport} className="w-full bg-gradient-to-r from-blue-500 to-cyan-600">Download Backup</Button>
            <button onClick={handleCsvExport} className="w-full mt-2 px-4 py-2 rounded-xl font-semibold text-blue-700 border border-blue-300 bg-white">Download CSV</button>
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
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🗑️ Delete by Date Range</h2>
        <p className="text-gray-600 mb-4">Permanently delete entries in a selected date range. Export a backup first.</p>
        <div className="grid grid-cols-3 gap-2"><Button onClick={() => deleteRange('dosage')} className="bg-red-500">Insulin</Button><Button onClick={() => deleteRange('levels')} className="bg-red-500">Glucose</Button><Button onClick={() => deleteRange('food')} className="bg-red-500">Food</Button></div>
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
function Graphs({ data, glucoseUnit }) {
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

  const timeLabel = date => format(date, range === '1D' ? 'HH:mm' : range === '1W' ? 'EEE HH:mm' : 'MM/dd');
  const levelData = filterData(data.levels).map(i => ({ time: timeLabel(new Date(i.timestamp)), level: i.level }));
  const dosageData = filterData(data.dosage).map(i => ({ time: timeLabel(new Date(i.timestamp)), units: i.units }));

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
        <h3 className="font-semibold text-gray-700 mb-2">Blood Glucose ({glucoseUnit})</h3>
        <div className="h-64 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={levelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis domain={['auto', 'auto']} stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid #e5e7eb', backdropFilter: 'blur(4px)' }} />
              {data.settings.target_low && data.settings.target_high && <ReferenceArea y1={data.settings.target_low} y2={data.settings.target_high} fill="#bbf7d0" fillOpacity={0.35} />}
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
