import './App.css';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState, useEffect } from 'react';

let _setToasts = null;
function toast(msg, type = 'success') {
  if (!_setToasts) return;
  const id = Date.now() + Math.random();
  _setToasts(p => [...p, { id, msg, type }]);
  setTimeout(() => _setToasts(p => p.filter(t => t.id !== id)), 3000);
}

const fmtPHP = v => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(v) || 0);

const BILL_CATS = [
  { id: 'electric', icon: '💡', label: 'Electricity' },
  { id: 'water',    icon: '💧', label: 'Water' },
  { id: 'internet', icon: '📶', label: 'Internet' },
  { id: 'rent',     icon: '🏠', label: 'Rent' },
  { id: 'phone',    icon: '📱', label: 'Phone' },
  { id: 'insurance',icon: '🛡', label: 'Insurance' },
  { id: 'gas',      icon: '🔥', label: 'Gas' },
  { id: 'other',    icon: '📄', label: 'Other' },
];

function normalizeType(e) {
  if (e?.type) return e.type;
  if (e?.restockItems || e?.manualItems) return 'grocery';
  return 'grocery';
}
function lsGet(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── Toast Component ──────────────────────────────────────────────
function Toasts() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

// ── Dashboard Tab ────────────────────────────────────────────────
function DonutChart({ grocery, loans, bills }) {
  const total = grocery + loans + bills;
  const r = 45, circ = 2 * Math.PI * r;
  function arc(pct, offset, color) {
    const dash = (pct / 100) * circ, gap = circ - dash;
    return <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12"
      strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-(offset * circ / 100)}
      transform="rotate(-90 60 60)" strokeLinecap="round" />;
  }
  const gp = total > 0 ? (grocery / total) * 100 : 33;
  const lp = total > 0 ? (loans / total) * 100 : 33;
  const bp = total > 0 ? (bills / total) * 100 : 34;
  return (
    <svg width="110" height="110" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
      {total > 0 ? <>{arc(gp, 0, '#22c55e')}{arc(lp, gp, '#4f8cff')}{arc(bp, gp + lp, '#f59e0b')}</> : null}
      <text x="60" y="55" textAnchor="middle" fill="#f0f4ff" fontSize="10" fontWeight="700">TOTAL</text>
      <text x="60" y="69" textAnchor="middle" fill="#8ba3c7" fontSize="9">this month</text>
    </svg>
  );
}

function DashboardTab({ inventory, history, bills, loans, monthlyBudget, setActiveTab }) {
  const now = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();
  const thisMonth = history.filter(e => { const d = new Date(e.date); return d.getMonth() === mo && d.getFullYear() === yr; });
  const gTotal = thisMonth.filter(e => normalizeType(e) === 'grocery').reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);
  const lTotal = thisMonth.filter(e => normalizeType(e) === 'loan').reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);
  const bTotal = thisMonth.filter(e => normalizeType(e) === 'bill').reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);
  const overall = gTotal + lTotal + bTotal;
  const budget = monthlyBudget;
  const bPct = budget > 0 ? Math.min((gTotal / budget) * 100, 100) : 0;
  const bColor = bPct >= 90 ? '#ef4444' : bPct >= 70 ? '#f59e0b' : '#22c55e';
  const bStatus = bPct >= 90 ? 'Over Budget' : bPct >= 70 ? 'Warning' : 'Healthy';
  const bBadge = bPct >= 90 ? 'badge-red' : bPct >= 70 ? 'badge-amber' : 'badge-green';
  const ym = `${yr}-${String(mo + 1).padStart(2, '0')}`;
  const unpaidBills = bills.filter(b => !(b.paidByMonth || {})[ym]).length;
  const billsTotal = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const billsPaid = bills.filter(b => (b.paidByMonth || {})[ym]).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const activeLoans = loans.filter(l => !l.completed).length;
  const loanRemain = loans.reduce((s, l) => s + (Number(l.balance) || 0), 0);
  const restockNeeded = inventory.filter(i => i.current <= i.threshold).length;
  const grocTrips = thisMonth.filter(e => normalizeType(e) === 'grocery').length;
  const highTrip = grocTrips > 0 ? Math.max(...thisMonth.filter(e => normalizeType(e) === 'grocery').map(e => Number(e.grandTotal) || 0)) : 0;
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Dashboard</h2>
      <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 18 }}>{monthName}</p>
      <div className="card-grid">
        <div className="stat-card" onClick={() => setActiveTab('grocery')}>
          <div className="stat-label">🛒 Grocery Budget</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{fmtPHP(gTotal)}</div>
          <div className="prog-track" style={{ height: 6 }}>
            <div className="prog-fill" style={{ width: `${bPct}%`, background: bColor }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>{budget > 0 ? `of ${fmtPHP(budget)}` : 'No budget set'}</span>
            <span className={`badge ${bBadge}`}>{bStatus}</span>
          </div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab('bills')}>
          <div className="stat-label">📋 Bills</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: unpaidBills > 0 ? 'var(--amber)' : 'var(--green)' }}>{unpaidBills}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>unpaid</div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="summary-row"><span>Total</span><strong>{fmtPHP(billsTotal)}</strong></div>
            <div className="summary-row"><span>Remaining</span><strong style={{ color: billsTotal - billsPaid > 0 ? 'var(--amber)' : 'var(--green)' }}>{fmtPHP(billsTotal - billsPaid)}</strong></div>
          </div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab('loans')}>
          <div className="stat-label">💳 Loans</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>{fmtPHP(loanRemain)}</div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>remaining balance</div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="summary-row"><span>Paid this month</span><strong>{fmtPHP(lTotal)}</strong></div>
            <div className="summary-row"><span>Active loans</span><strong>{activeLoans}</strong></div>
          </div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab('inventory')}>
          <div className="stat-label">📦 Inventory</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: restockNeeded > 0 ? 'var(--red)' : 'var(--green)' }}>{restockNeeded}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>need restock</div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="summary-row"><span>Total items</span><strong>{inventory.length}</strong></div>
            <div className="summary-row"><span>Grocery trips</span><strong>{grocTrips}</strong></div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Spending Breakdown</div>
          <div className="donut-wrap">
            <DonutChart grocery={gTotal} loans={lTotal} bills={bTotal} />
            <div className="donut-legend">
              {[['#22c55e','Groceries',gTotal],['#4f8cff','Loans',lTotal],['#f59e0b','Bills',bTotal]].map(([c,l,v]) => (
                <div key={l} className="donut-legend-item">
                  <div className="donut-dot" style={{ background: c }} />
                  <div><div style={{ fontSize: 11, color: 'var(--t2)' }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{fmtPHP(v)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Monthly Summary</div>
          <div className="summary-row"><span>Groceries</span><strong>{fmtPHP(gTotal)}</strong></div>
          <div className="summary-row"><span>Loans Paid</span><strong>{fmtPHP(lTotal)}</strong></div>
          <div className="summary-row"><span>Bills Paid</span><strong>{fmtPHP(bTotal)}</strong></div>
          <hr className="divider" />
          <div className="summary-row">
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
            <strong style={{ fontSize: 18 }}>{fmtPHP(overall)}</strong>
          </div>
          <div className="summary-row"><span>Highest Trip</span><strong>{fmtPHP(highTrip)}</strong></div>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Tab ────────────────────────────────────────────────
function InventoryTab({ inventory, onAdd, onDelete, onUpdate, onGoToGrocery }) {
  const [name, setName] = useState('');
  const [cap, setCap] = useState('');
  const [cur, setCur] = useState('');
  const [thresh, setThresh] = useState('');
  const [ppu, setPpu] = useState('');
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');

  function handleAdd() {
    if (!name || !cap || !ppu) { toast('Fill in name, capacity and price.', 'error'); return; }
    const c = Number(cap), p = Number(ppu), cu = Number(cur) || 0, th = Number(thresh) || 0;
    if (c <= 0 || p < 0) { toast('Invalid values.', 'error'); return; }
    onAdd({ name: name.trim(), capacity: c, current: Math.min(cu, c), threshold: Math.min(th, c), pricePerUnit: p });
    setName(''); setCap(''); setCur(''); setThresh(''); setPpu('');
    toast('✓ ' + name.trim() + ' added');
  }

  const restockNeeded = inventory.filter(i => i.current <= i.threshold);

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>📦 Inventory</h2>
      <div className="card card-soft" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Add New Item</div>
        <div className="form-row-2">
          <div><label>Item Name</label><input placeholder="e.g. Rice" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label>Price per Unit (₱)</label><input type="number" placeholder="e.g. 55" value={ppu} onChange={e => setPpu(e.target.value)} /></div>
        </div>
        <div className="form-row-3" style={{ marginTop: 10 }}>
          <div><label>Capacity</label><input type="number" placeholder="Max" value={cap} onChange={e => setCap(e.target.value)} /></div>
          <div><label>Current</label><input type="number" placeholder="Now" value={cur} onChange={e => setCur(e.target.value)} /></div>
          <div><label>Alert at</label><input type="number" placeholder="Threshold" value={thresh} onChange={e => setThresh(e.target.value)} /></div>
        </div>
        <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleAdd}>+ Add Item</button>
      </div>
      {restockNeeded.length > 0 && (
        <div className="restock-alert">
          ⚠️ {restockNeeded.length} item(s) need restocking
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onGoToGrocery}>Go to Grocery →</button>
        </div>
      )}
      {inventory.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-title">No inventory items yet</div><div className="empty-sub">Add items above to track stock levels.</div></div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>{inventory.length} items tracked</div>
          {inventory.map(item => {
            const pct = item.capacity > 0 ? (item.current / item.capacity) * 100 : 0;
            const low = item.current <= item.threshold;
            const barColor = low ? 'var(--red)' : pct > 60 ? 'var(--green)' : 'var(--amber)';
            const isEditing = editId === item.id;
            return (
              <div key={item.id} className="item-card">
                <div className="item-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t2)' }}>{fmtPHP(item.pricePerUnit)} / unit</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {low && <span className="badge badge-red">⚠ Low</span>}
                    <button className="btn btn-sm btn-ghost" onClick={() => { setEditId(isEditing ? null : item.id); setEditVal(String(item.current)); }}>{isEditing ? 'Done' : '✏️'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => { onDelete(item.id); toast('Item removed', 'info'); }}>🗑</button>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
                    <span>{item.current} / {item.capacity} units</span><span>{Math.round(pct)}%</span>
                  </div>
                  <div className="prog-track"><div className="prog-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor }} /></div>
                </div>
                {isEditing && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <label>Update Current Amount</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)} style={{ maxWidth: 120 }} />
                      <button className="btn btn-sm btn-primary" onClick={() => { onUpdate(item.id, editVal); setEditId(null); toast('✓ Updated'); }}>Update</button>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t3)' }}>Alert at: {item.threshold} · Max: {item.capacity}</div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Grocery Tab ──────────────────────────────────────────────────
function GroceryTab({ inventory, history, monthlyBudget, setMonthlyBudget, manualItems, setManualItems, restockQtys, setRestockQtys, onCompletePurchase }) {
  const [mName, setMName] = useState('');
  const [mPrice, setMPrice] = useState('');
  const now = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();
  const gTotal = history.filter(e => {
    const d = new Date(e.date);
    return normalizeType(e) === 'grocery' && d.getMonth() === mo && d.getFullYear() === yr;
  }).reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const restockItems = inventory.filter(i => i.current <= i.threshold);
  const restockCost = restockItems.reduce((s, item) => s + (Number(restockQtys[item.id]) || 0) * (Number(item.pricePerUnit) || 0), 0);
  const manualCost = manualItems.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const cartTotal = restockCost + manualCost;
  const projected = gTotal + cartTotal;
  const budget = monthlyBudget;
  const projPct = budget > 0 ? Math.min((projected / budget) * 100, 100) : 0;
  const bColor = projPct >= 90 ? '#ef4444' : projPct >= 70 ? '#f59e0b' : '#22c55e';
  const remaining = budget - projected;

  function addManual() {
    if (!mName || mPrice === '') { toast('Enter name and price.', 'error'); return; }
    const p = Number(mPrice);
    if (!Number.isFinite(p) || p < 0) { toast('Invalid price.', 'error'); return; }
    const updated = [...manualItems, { id: Date.now(), name: mName.trim(), price: p }];
    setManualItems(updated); lsSet('hl_manual', updated);
    setMName(''); setMPrice('');
    toast('✓ ' + mName.trim() + ' added');
  }

  function removeManual(id) {
    const updated = manualItems.filter(i => i.id !== id);
    setManualItems(updated); lsSet('hl_manual', updated);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>🛒 Grocery</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Monthly Grocery Budget</div>
          {budget > 0 && <span className={`badge ${projPct >= 90 ? 'badge-red' : projPct >= 70 ? 'badge-amber' : 'badge-green'}`}>{projected > budget ? 'Over Budget' : 'Within Budget'}</span>}
        </div>
        <input type="number" placeholder="Set monthly budget (₱)" value={budget || ''} onChange={e => { const v = Number(e.target.value); setMonthlyBudget(v); localStorage.setItem('hl_budget', String(v)); }} />
        {budget > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--t2)', margin: '10px 0 6px' }}>
              <span>Spent incl. cart: {fmtPHP(projected)}</span>
              <span style={{ color: remaining < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{remaining < 0 ? 'Over by ' : 'Remaining: '}{fmtPHP(Math.abs(remaining))}</span>
            </div>
            <div className="prog-track" style={{ height: 10 }}><div className="prog-fill" style={{ width: `${projPct}%`, background: bColor, height: '100%' }} /></div>
          </>
        )}
      </div>

      <div className="sec-head">📋 Restock Checklist</div>
      {restockItems.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div className="empty-title">All stocked up!</div>
          <div className="empty-sub">No items are below threshold.</div>
        </div>
      ) : restockItems.map(item => {
        const qty = Number(restockQtys[item.id]) || 0;
        const cost = qty * (Number(item.pricePerUnit) || 0);
        const needMax = Math.max(0, item.capacity - item.current);
        return (
          <div key={item.id} className="item-card">
            <div className="item-row">
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Stock: {item.current}/{item.capacity} · {fmtPHP(item.pricePerUnit)}/unit</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{fmtPHP(cost)}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>line total</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <input type="number" placeholder="Qty" value={restockQtys[item.id] || ''} onChange={e => setRestockQtys(p => ({ ...p, [item.id]: Number(e.target.value) || 0 }))} style={{ width: 90 }} />
              <button className="btn btn-sm btn-ghost" onClick={() => setRestockQtys(p => ({ ...p, [item.id]: needMax }))}>Fill Max ({needMax})</button>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t2)' }}>{fmtPHP(cost)}</span>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, margin: '8px 0', fontSize: 13 }}>
        <span style={{ color: 'var(--t2)' }}>Restock Subtotal</span><strong>{fmtPHP(restockCost)}</strong>
      </div>

      <div className="sec-head" style={{ marginTop: 18 }}>✏️ Manual Items</div>
      <div className="card card-soft" style={{ marginBottom: 12 }}>
        <div className="form-row-2">
          <div><label>Item Name</label><input placeholder="Item name" value={mName} onChange={e => setMName(e.target.value)} /></div>
          <div><label>Price (₱)</label><input type="number" placeholder="0.00" value={mPrice} onChange={e => setMPrice(e.target.value)} /></div>
        </div>
        <button className="btn btn-ghost btn-full" onClick={addManual}>+ Add Item</button>
      </div>
      {manualItems.map(item => (
        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8 }}>
          <span>{item.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong>{fmtPHP(item.price)}</strong>
            <button className="btn btn-sm btn-danger" onClick={() => removeManual(item.id)}>✕</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, margin: '4px 0', fontSize: 13 }}>
        <span style={{ color: 'var(--t2)' }}>Manual Subtotal</span><strong>{fmtPHP(manualCost)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'var(--card2)', border: '1px solid var(--border2)', borderRadius: 16, margin: '14px 0' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Grand Total</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{fmtPHP(cartTotal)}</span>
      </div>
      {(restockItems.length > 0 || manualItems.length > 0) && (
        <button className="btn-success btn-full" style={{ fontSize: 15, padding: 14 }} onClick={onCompletePurchase}>✓ Complete Purchase</button>
      )}
    </div>
  );
}

// ── Bills Tab ────────────────────────────────────────────────────
function BillsTab({ bills, onAdd, onDelete, onTogglePaid }) {
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('electric');
  const [due, setDue] = useState('');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const total = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const paid = bills.filter(b => (b.paidByMonth || {})[ym]).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const paidPct = total > 0 ? (paid / total) * 100 : 0;

  function handleAdd() {
    if (!name || !amt) { toast('Enter bill name and amount.', 'error'); return; }
    const a = Number(amt), d = Number(due) || 0;
    if (a <= 0) { toast('Invalid amount.', 'error'); return; }
    onAdd({ id: Date.now(), name: name.trim(), amount: a, category: cat, dueDay: d, paidByMonth: {} });
    setName(''); setAmt(''); setDue(''); toast('✓ ' + name.trim() + ' added');
  }

  const unpaidBills = bills.filter(b => !(b.paidByMonth || {})[ym]);
  const paidBills = bills.filter(b => (b.paidByMonth || {})[ym]);

  function BillItem({ b, isPaid }) {
    const catObj = BILL_CATS.find(c => c.id === b.category) || BILL_CATS[BILL_CATS.length - 1];
    const dueStr = b.dueDay ? `Due: ${b.dueDay}${[,'st','nd','rd'][b.dueDay]||'th'} of month` : '';
    return (
      <div className="item-card" style={{ opacity: isPaid ? 0.65 : 1 }}>
        <div className="item-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{catObj.icon}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>{catObj.label}{dueStr ? ' · ' + dueStr : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <strong style={{ fontSize: 15 }}>{fmtPHP(b.amount)}</strong>
            <button className={`paid-toggle ${isPaid ? 'paid' : ''}`} onClick={() => onTogglePaid(b.id)}>{isPaid ? '✓ Paid' : 'Mark Paid'}</button>
            <button className="btn btn-sm btn-danger" onClick={() => { onDelete(b.id); toast('Bill removed', 'info'); }}>🗑</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>📋 Bills</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
          <div><div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Total</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmtPHP(total)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Paid</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--green)' }}>{fmtPHP(paid)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Remaining</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: total - paid > 0 ? 'var(--amber)' : 'var(--green)' }}>{fmtPHP(total - paid)}</div></div>
        </div>
        <div className="prog-track" style={{ height: 10, marginTop: 14 }}><div className="prog-fill" style={{ width: `${paidPct}%`, background: 'var(--green)', height: '100%' }} /></div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>{Math.round(paidPct)}% paid this month</div>
      </div>
      <div className="card card-soft" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Add New Bill</div>
        <div className="form-row-2">
          <div><label>Bill Name</label><input placeholder="e.g. Meralco" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label>Amount (₱)</label><input type="number" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} /></div>
        </div>
        <div className="form-row-2" style={{ marginTop: 0 }}>
          <div><label>Category</label>
            <select value={cat} onChange={e => setCat(e.target.value)}>
              {BILL_CATS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div><label>Due Day (1–31)</label><input type="number" placeholder="e.g. 15" min="1" max="31" value={due} onChange={e => setDue(e.target.value)} /></div>
        </div>
        <button className="btn-primary btn-full" onClick={handleAdd}>+ Add Bill</button>
      </div>
      {bills.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">No bills yet</div><div className="empty-sub">Add recurring bills to track payments each month.</div></div>
      ) : (
        <>
          {unpaidBills.length > 0 && <><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', margin: '14px 0 8px' }}>Unpaid ({unpaidBills.length})</div>{unpaidBills.map(b => <BillItem key={b.id} b={b} isPaid={false} />)}</>}
          {paidBills.length > 0 && <><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', margin: '14px 0 8px' }}>Paid ({paidBills.length})</div>{paidBills.map(b => <BillItem key={b.id} b={b} isPaid={true} />)}</>}
        </>
      )}
    </div>
  );
}

// ── Loan Card ────────────────────────────────────────────────────
function LoanCard({ loan, onDelete, onPay, onSetTerms }) {
  const [payAmt, setPayAmt] = useState('');
  const [termInput, setTermInput] = useState(String(Number(loan.installmentsPaid) || 0));
  const term = Number(loan.term) || 0;
  const paid = Number(loan.installmentsPaid) || 0;
  const payAmt2 = Number(loan.paymentAmount) || 0;
  const pct = term > 0 ? Math.min((paid / term) * 100, 100) : 0;
  const barColor = loan.completed ? 'var(--green)' : pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--blue)' : 'var(--purple)';
  const unit = loan.paymentFrequency === 'daily' ? 'day' : loan.paymentFrequency === 'weekly' ? 'week' : 'month';
  let payoffStr = '';
  if (!loan.completed && term > 0 && paid < term) {
    const rem = term - paid;
    const d = new Date();
    if (loan.paymentFrequency === 'daily') d.setDate(d.getDate() + rem);
    else if (loan.paymentFrequency === 'weekly') d.setDate(d.getDate() + rem * 7);
    else d.setMonth(d.getMonth() + rem);
    payoffStr = d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  }

  return (
    <div className="item-card" style={{ opacity: loan.completed ? 0.7 : 1, borderColor: loan.completed ? 'rgba(34,197,94,0.2)' : undefined }}>
      <div className="item-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💳</div>
          <div>
            <div style={{ fontWeight: 600 }}>{loan.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{payAmt2 ? `${fmtPHP(payAmt2)} / ${unit}` : ''}{term ? ` · ${term} ${unit}s` : ''}</div>
          </div>
        </div>
        {loan.completed ? <span className="badge badge-green">✅ Paid Off</span> : (
          <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700, fontSize: 15 }}>{fmtPHP(loan.balance)}</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>remaining</div></div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
          <span>{paid} / {term || '?'} {unit}s paid</span><span>{Math.round(pct)}%</span>
        </div>
        <div className="prog-track"><div className="prog-fill" style={{ width: `${pct}%`, background: barColor }} /></div>
      </div>
      <div className="loan-snapshot">
        <div className="loan-row"><span>Total Tracked</span><strong>{term > 0 ? fmtPHP(payAmt2 * term) : '-'}</strong></div>
        <div className="loan-row"><span>Total Paid</span><strong>{fmtPHP(payAmt2 * paid)}</strong></div>
        <div className="loan-row"><span>Remaining</span><strong>{fmtPHP(payAmt2 * Math.max(0, term - paid))}</strong></div>
        {payoffStr && <div className="loan-row"><span>Est. Payoff</span><strong style={{ color: 'var(--teal)' }}>📅 {payoffStr}</strong></div>}
      </div>
      {!loan.completed ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <input type="number" placeholder="Payment (₱)" value={payAmt} onChange={e => setPayAmt(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <button className="btn btn-sm btn-primary" onClick={() => { onPay(loan.id, payAmt); setPayAmt(''); }}>Pay</button>
          <input type="number" placeholder="Paid terms" value={termInput} onChange={e => setTermInput(e.target.value)} style={{ flex: 1, minWidth: 90, maxWidth: 120 }} />
          <button className="btn btn-sm btn-ghost" onClick={() => onSetTerms(loan.id, termInput)}>Set</button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(loan.id)}>🗑</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(loan.id)}>🗑 Remove</button>
        </div>
      )}
    </div>
  );
}

// ── Loans Tab ────────────────────────────────────────────────────
function LoansTab({ loans, history, onAdd, onDelete, onPay, onSetTerms }) {
  const [name, setName] = useState('');
  const [bal, setBal] = useState('');
  const [pay, setPay] = useState('');
  const [freq, setFreq] = useState('monthly');
  const [term, setTerm] = useState('');

  function handleAdd() {
    if (!name || !bal || !term) { toast('Fill in name, principal, and term.', 'error'); return; }
    const b = Number(bal), p = Number(pay) || 0, t = Number(term);
    if (b <= 0 || t <= 0) { toast('Invalid values.', 'error'); return; }
    onAdd({ id: Date.now(), name: name.trim(), originalBalance: b, balance: b, paymentAmount: p, paymentFrequency: freq, term: t, installmentsPaid: 0, payments: [], completed: false });
    setName(''); setBal(''); setPay(''); setTerm('');
    toast('✓ Loan added');
  }

  const active = loans.filter(l => !l.completed);
  const completed = loans.filter(l => l.completed);
  const totalRemain = active.reduce((s, l) => s + (Number(l.balance) || 0), 0);

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>💳 Loans</h2>
      <div className="card card-soft" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Add New Loan</div>
        <div className="form-row-2">
          <div><label>Loan Name</label><input placeholder="e.g. SSS Loan" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label>Principal (₱)</label><input type="number" placeholder="e.g. 24000" value={bal} onChange={e => setBal(e.target.value)} /></div>
        </div>
        <div className="form-row-3" style={{ marginTop: 0 }}>
          <div><label>Payment / Period (₱)</label><input type="number" placeholder="e.g. 1000" value={pay} onChange={e => setPay(e.target.value)} /></div>
          <div><label>Frequency</label>
            <select value={freq} onChange={e => setFreq(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div><label>Term (# periods)</label><input type="number" placeholder="e.g. 24" value={term} onChange={e => setTerm(e.target.value)} /></div>
        </div>
        <button className="btn-primary btn-full" onClick={handleAdd}>+ Add Loan</button>
      </div>
      {loans.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">💳</div><div className="empty-title">No loans yet</div><div className="empty-sub">Track your loans and payment progress here.</div></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}><div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Remaining</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{fmtPHP(totalRemain)}</div></div>
            <div className="card" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}><div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600 }}>Active Loans</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{active.length}</div></div>
          </div>
          {active.length > 0 && <><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginBottom: 10 }}>Active ({active.length})</div>{active.map(l => <LoanCard key={l.id} loan={l} onDelete={id => { onDelete(id); toast('Loan removed', 'info'); }} onPay={onPay} onSetTerms={onSetTerms} />)}</>}
          {completed.length > 0 && <><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', margin: '16px 0 10px' }}>Completed ({completed.length})</div>{completed.map(l => <LoanCard key={l.id} loan={l} onDelete={id => { onDelete(id); toast('Loan removed', 'info'); }} onPay={onPay} onSetTerms={onSetTerms} />)}</>}
        </>
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────
function HistoryTab({ history, onDelete, onClearAll }) {
  const [filter, setFilter] = useState('all');
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const now = new Date();
  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
  const viewDate = new Date(viewYear, viewMonth, 1);
  const monthLabel = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const filtered = history.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear && (filter === 'all' || normalizeType(e) === filter);
  });
  const total = filtered.reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const TYPE_META = {
    grocery: { icon: '🛒', label: 'Grocery', bg: 'rgba(34,197,94,0.07)', border: 'rgba(34,197,94,0.18)', badge: 'badge-green' },
    loan:    { icon: '💳', label: 'Loan Payment', bg: 'rgba(79,140,255,0.07)', border: 'rgba(79,140,255,0.18)', badge: 'badge-blue' },
    bill:    { icon: '📋', label: 'Bill Payment', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.18)', badge: 'badge-amber' },
  };

  function changeMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    if (d > now) return;
    setViewMonth(d.getMonth()); setViewYear(d.getFullYear());
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>🕓 History</h2>
      <div className="hist-filters">
        {['all','grocery','bill','loan'].map(f => (
          <div key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {{ all:'🗂 All', grocery:'🛒 Grocery', bill:'📋 Bill', loan:'💳 Loan' }[f]}
          </div>
        ))}
      </div>
      <div className="month-nav">
        <button className="btn btn-sm btn-ghost" onClick={() => changeMonth(-1)}>‹ Prev</button>
        <span>{monthLabel}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => changeMonth(1)} disabled={isCurrentMonth} style={{ opacity: isCurrentMonth ? 0.3 : 1 }}>Next ›</button>
      </div>
      {filtered.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 12 }}>
          <span style={{ color: 'var(--t2)', fontSize: 13 }}>{filtered.length} entries</span>
          <strong>{fmtPHP(total)}</strong>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🕓</div><div className="empty-title">No entries</div><div className="empty-sub">No {filter !== 'all' ? filter + ' ' : ''}records for this month.</div></div>
      ) : filtered.map(entry => {
        const type = normalizeType(entry);
        const m = TYPE_META[type] || TYPE_META.grocery;
        return (
          <div key={entry.id} style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <span className={`badge ${m.badge}`}>{m.icon} {m.label}</span>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>{new Date(entry.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => { onDelete(entry.id); toast('Entry deleted', 'info'); }}>🗑</button>
            </div>
            {type === 'grocery' ? (
              <>
                {entry.restockItems?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 4 }}>RESTOCK ITEMS</div>
                    {entry.restockItems.map((i, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}><span>{i.name} × {i.quantity}</span><span style={{ color: 'var(--t2)' }}>{fmtPHP(i.cost)}</span></div>)}
                  </div>
                )}
                {entry.manualItems?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 4 }}>MANUAL ITEMS</div>
                    {entry.manualItems.map((i, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}><span>{i.name} × {i.quantity}</span><span style={{ color: 'var(--t2)' }}>{fmtPHP(i.cost)}</span></div>)}
                  </div>
                )}
              </>
            ) : <div style={{ fontWeight: 600, marginBottom: 8 }}>{entry.title || m.label}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <strong style={{ fontSize: 18 }}>{fmtPHP(entry.grandTotal)}</strong>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button className="btn btn-danger btn-sm" onClick={onClearAll}>🗑 Clear All History</button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hl_tab') || 'dashboard');
  useEffect(() => { localStorage.setItem('hl_tab', activeTab); }, [activeTab]);

  // Inventory — Firebase real-time
  const [inventory, setInventory] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), snap => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function addInventoryItem(item) {
    await addDoc(collection(db, 'inventory'), item);
  }
  async function deleteInventoryItem(id) {
    await deleteDoc(doc(db, 'inventory', id));
  }
  async function updateInventoryCurrent(id, val) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const n = Math.max(0, Math.min(item.capacity, Number(val)));
    await updateDoc(doc(db, 'inventory', id), { current: n });
  }

  // History — localStorage
  const [history, setHistory] = useState(() => lsGet('hl_history', []));
  function addHistory(entry) { const u = [entry, ...history]; setHistory(u); lsSet('hl_history', u); }
  function deleteHistory(id) { const u = history.filter(e => e.id !== id); setHistory(u); lsSet('hl_history', u); }
  function clearHistory() { if (!window.confirm('Clear ALL history?')) return; setHistory([]); lsSet('hl_history', []); toast('History cleared', 'info'); }

  // Bills — localStorage
  const [bills, setBills] = useState(() => lsGet('hl_bills', []).map(b => ({ ...b, paidByMonth: b.paidByMonth || {} })));
  function addBill(b) { const u = [...bills, b]; setBills(u); lsSet('hl_bills', u); }
  function deleteBill(id) { const u = bills.filter(b => b.id !== id); setBills(u); lsSet('hl_bills', u); toast('Bill removed', 'info'); }
  function toggleBillPaid(id) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const u = bills.map(b => {
      if (b.id !== id) return b;
      const pbm = { ...(b.paidByMonth || {}) };
      const next = !pbm[ym];
      pbm[ym] = next;
      if (next) { addHistory({ id: Date.now(), type: 'bill', date: new Date().toISOString(), title: 'Bill Payment - ' + b.name, grandTotal: Number(b.amount) || 0 }); toast('✓ ' + b.name + ' marked paid'); }
      else toast(b.name + ' unmarked', 'info');
      return { ...b, paidByMonth: pbm };
    });
    setBills(u); lsSet('hl_bills', u);
  }

  // Loans — localStorage
  const [loans, setLoans] = useState(() => lsGet('hl_loans', []).map(l => ({
    ...l, paidByMonth: l.paidByMonth || {}, payments: l.payments || [],
    completed: !!l.completed || Number(l.balance) <= 0 || ((Number(l.installmentsPaid) || 0) >= (Number(l.term) || 0) && (Number(l.term) || 0) > 0),
  })));
  function addLoan(l) { const u = [...loans, l]; setLoans(u); lsSet('hl_loans', u); }
  function deleteLoan(id) { const u = loans.filter(l => l.id !== id); setLoans(u); lsSet('hl_loans', u); }
  function payLoan(id, amtStr) {
    const amt = Number(amtStr);
    if (!amt || amt <= 0) { toast('Enter a payment amount.', 'error'); return; }
    const lb = loans.find(l => l.id === id);
    if (!lb || lb.completed) return;
    const u = loans.map(l => {
      if (l.id !== id) return l;
      const newBal = Math.max(0, Number(l.balance) - amt);
      const term = Number(l.term) || 0;
      const nextInst = term > 0 ? Math.min(term, (Number(l.installmentsPaid) || 0) + 1) : (Number(l.installmentsPaid) || 0) + 1;
      const done = (term > 0 && nextInst >= term) || newBal <= 0;
      return { ...l, balance: newBal, installmentsPaid: nextInst, completed: done, payments: [{ date: new Date().toISOString(), amount: amt }, ...l.payments] };
    });
    setLoans(u); lsSet('hl_loans', u);
    addHistory({ id: Date.now(), type: 'loan', date: new Date().toISOString(), title: 'Loan Payment - ' + lb.name, grandTotal: amt });
    toast('✓ ' + fmtPHP(amt) + ' payment recorded');
  }
  function setLoanTerms(id, val) {
    const v = Math.floor(Number(val));
    if (!Number.isFinite(v) || v < 0) return;
    const u = loans.map(l => {
      if (l.id !== id) return l;
      const term = Number(l.term) || 0;
      const next = term > 0 ? Math.min(term, v) : v;
      return { ...l, installmentsPaid: next, completed: (term > 0 && next >= term) || Number(l.balance) <= 0 };
    });
    setLoans(u); lsSet('hl_loans', u); toast('✓ Terms updated');
  }

  // Budget
  const [monthlyBudget, setMonthlyBudget] = useState(() => Number(localStorage.getItem('hl_budget') || 0));

  // Grocery cart state
  const [manualItems, setManualItems] = useState(() => lsGet('hl_manual', []));
  const [restockQtys, setRestockQtys] = useState({});

  function completePurchase() {
    const restockItems = inventory.filter(i => i.current <= i.threshold);
    const restockPurchased = [], manualPurchased = manualItems.map(i => ({ name: i.name, quantity: 1, cost: Number(i.price) || 0 }));
    restockItems.forEach(item => {
      const qty = Number(restockQtys[item.id]) || 0;
      if (qty > 0) {
        restockPurchased.push({ name: item.name, quantity: qty, cost: qty * (Number(item.pricePerUnit) || 0) });
        updateInventoryCurrent(item.id, Math.min(item.capacity, item.current + qty));
      }
    });
    const rTotal = restockPurchased.reduce((s, i) => s + i.cost, 0);
    const mTotal = manualPurchased.reduce((s, i) => s + i.cost, 0);
    const grand = rTotal + mTotal;
    if (grand <= 0) { toast('Nothing to purchase.', 'error'); return; }
    const now = new Date(); const mo = now.getMonth(), yr = now.getFullYear();
    const gTotal = history.filter(e => { const d = new Date(e.date); return normalizeType(e) === 'grocery' && d.getMonth() === mo && d.getFullYear() === yr; }).reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);
    if (monthlyBudget > 0 && gTotal + grand > monthlyBudget) {
      if (!window.confirm('This exceeds your grocery budget. Continue?')) return;
    }
    addHistory({ id: Date.now(), type: 'grocery', date: new Date().toISOString(), restockItems: restockPurchased, manualItems: manualPurchased, restockTotal: rTotal, manualTotal: mTotal, grandTotal: grand });
    setRestockQtys({}); setManualItems([]); lsSet('hl_manual', []);
    toast('✓ Purchase of ' + fmtPHP(grand) + ' recorded!');
  }

  const TABS = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'inventory', icon: '📦', label: 'Inventory' },
    { id: 'grocery',   icon: '🛒', label: 'Grocery' },
    { id: 'bills',     icon: '📋', label: 'Bills' },
    { id: 'loans',     icon: '💳', label: 'Loans' },
    { id: 'history',   icon: '🕓', label: 'History' },
  ];

  return (
    <div className="app-container">
      <Toasts />
      <div className="hl-header">
        <div className="hl-logo">🏠</div>
        <div>
          <div className="hl-title">Home Ledger</div>
          <div className="hl-subtitle">Household Finance Tracker</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="sync-dot" />
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Live</span>
        </div>
      </div>
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-button ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>
      {activeTab === 'dashboard' && <DashboardTab inventory={inventory} history={history} bills={bills} loans={loans} monthlyBudget={monthlyBudget} setActiveTab={setActiveTab} />}
      {activeTab === 'inventory' && <InventoryTab inventory={inventory} onAdd={addInventoryItem} onDelete={deleteInventoryItem} onUpdate={updateInventoryCurrent} onGoToGrocery={() => setActiveTab('grocery')} />}
      {activeTab === 'grocery' && <GroceryTab inventory={inventory} history={history} monthlyBudget={monthlyBudget} setMonthlyBudget={setMonthlyBudget} manualItems={manualItems} setManualItems={setManualItems} restockQtys={restockQtys} setRestockQtys={setRestockQtys} onCompletePurchase={completePurchase} />}
      {activeTab === 'bills' && <BillsTab bills={bills} onAdd={addBill} onDelete={deleteBill} onTogglePaid={toggleBillPaid} />}
      {activeTab === 'loans' && <LoansTab loans={loans} history={history} onAdd={addLoan} onDelete={deleteLoan} onPay={payLoan} onSetTerms={setLoanTerms} />}
      {activeTab === 'history' && <HistoryTab history={history} onDelete={deleteHistory} onClearAll={clearHistory} />}
    </div>
  );
}

export default App;
