import "./App.css";
import { useMemo, useState } from "react";

function App() {
  const [activeTab, setActiveTab] = useState("inventory");

  const formatPHP = (value) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(value) || 0);

  // ================= INVENTORY =================
  const [inventory, setInventory] = useState(() => {
    const saved = localStorage.getItem("inventory");
    return saved ? JSON.parse(saved) : [];
  });

  const [itemName, setItemName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [current, setCurrent] = useState("");
  const [threshold, setThreshold] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");

  function addItem() {
    if (!itemName || !capacity || !current || !pricePerUnit) return;

    const cap = Number(capacity);
    const cur = Number(current);
    const ppu = Number(pricePerUnit);

    if (!Number.isFinite(cap) || cap <= 0) return;
    if (!Number.isFinite(cur) || cur < 0) return;
    if (!Number.isFinite(ppu) || ppu < 0) return;

    const newItem = {
      id: Date.now(),
      name: itemName.trim(),
      capacity: cap,
      current: Math.min(cur, cap),
      threshold: Math.max(0, Math.min(Number(threshold) || 0, cap)),
      pricePerUnit: ppu,
    };

    const updated = [...inventory, newItem];
    setInventory(updated);
    localStorage.setItem("inventory", JSON.stringify(updated));

    setItemName("");
    setCapacity("");
    setCurrent("");
    setThreshold("");
    setPricePerUnit("");
  }

  function deleteInventoryItem(id) {
    const updated = inventory.filter((item) => item.id !== id);
    setInventory(updated);
    localStorage.setItem("inventory", JSON.stringify(updated));
  }

  function updateCurrent(id, value) {
    const updated = inventory.map((item) => {
      if (item.id === id) {
        let newValue = Number(value);
        if (!Number.isFinite(newValue)) newValue = 0;
        if (newValue < 0) newValue = 0;
        if (newValue > item.capacity) newValue = item.capacity;
        return { ...item, current: newValue };
      }
      return item;
    });

    setInventory(updated);
    localStorage.setItem("inventory", JSON.stringify(updated));
  }

  // ================= GROCERY =================
  const restockItems = inventory.filter((item) => item.current <= item.threshold);

  const [restockQuantities, setRestockQuantities] = useState({});

  // Persist manual items (NEW)
  const [manualItems, setManualItems] = useState(() => {
    const saved = localStorage.getItem("manualItems");
    return saved ? JSON.parse(saved) : [];
  });
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  function handleRestockQtyChange(id, value) {
    const n = Number(value);
    setRestockQuantities({
      ...restockQuantities,
      [id]: Number.isFinite(n) ? n : 0,
    });
  }

  function addManualItem() {
    if (!manualName || manualPrice === "") return;

    const p = Number(manualPrice);
    if (!Number.isFinite(p) || p < 0) return;

    const newItem = {
      id: Date.now(),
      name: manualName.trim(),
      price: p,
    };

    const updated = [...manualItems, newItem];
    setManualItems(updated);
    localStorage.setItem("manualItems", JSON.stringify(updated));

    setManualName("");
    setManualPrice("");
  }

  function deleteManualItem(id) {
    const updated = manualItems.filter((item) => item.id !== id);
    setManualItems(updated);
    localStorage.setItem("manualItems", JSON.stringify(updated));
  }

  // ================= HISTORY =================
  const [purchaseHistory, setPurchaseHistory] = useState(() => {
    const saved = localStorage.getItem("purchaseHistory");
    return saved ? JSON.parse(saved) : [];
  });

  function normalizeEntryType(entry) {
    // Backward compatible:
    // Old grocery entries don't have "type". Treat those as grocery if they look like grocery.
    if (entry?.type) return entry.type;
    if (entry?.restockItems || entry?.manualItems) return "grocery";
    // Unknown legacy entry fallback:
    return "grocery";
  }

  function addHistoryEntry(newEntry) {
    const updatedHistory = [newEntry, ...purchaseHistory];
    setPurchaseHistory(updatedHistory);
    localStorage.setItem("purchaseHistory", JSON.stringify(updatedHistory));
  }

  function deleteHistoryEntry(id) {
    const updated = purchaseHistory.filter((entry) => entry.id !== id);
    setPurchaseHistory(updated);
    localStorage.setItem("purchaseHistory", JSON.stringify(updated));
  }

  function clearAllHistory() {
    const confirmClear = window.confirm("Clear all purchase history?");
    if (!confirmClear) return;

    setPurchaseHistory([]);
    localStorage.removeItem("purchaseHistory");
  }

  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const saved = localStorage.getItem("monthlyBudget");
    return saved ? Number(saved) : 0;
  });

  // ================= MONTHLY SUMMARY (shared helpers) =================
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthEntries = useMemo(() => {
    return purchaseHistory.filter((entry) => {
      const d = new Date(entry.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [purchaseHistory, currentMonth, currentYear]);

  // ---- Monthly Totals (NEW LOGIC) ----
  // Keep groceries separate from bills/loans budget.
  const monthlyGroceryTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "grocery")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyLoanTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "loan")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyBillTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "bill")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyOverallTotal = monthlyGroceryTotal + monthlyLoanTotal + monthlyBillTotal;

  // Grocery trips + highest trip should be grocery-only
  const thisMonthGroceryEntries = thisMonthEntries.filter((e) => normalizeEntryType(e) === "grocery");
  const highestTrip =
    thisMonthGroceryEntries.length > 0
      ? Math.max(...thisMonthGroceryEntries.map((e) => Number(e.grandTotal) || 0))
      : 0;

  // Budget extras (Budget applies to GROCERY only)
  const remainingBudget = monthlyBudget - monthlyGroceryTotal;
  const budgetPercent =
    monthlyBudget > 0 ? Math.min((monthlyGroceryTotal / monthlyBudget) * 100, 100) : 0;

  function completePurchase() {
    let updatedInventory = [...inventory];
    const restockPurchased = [];
    const manualPurchased = [];

    // restock purchases
    restockItems.forEach((item) => {
      const qty = Number(restockQuantities[item.id]) || 0;
      if (qty > 0) {
        const cost = qty * (Number(item.pricePerUnit) || 0);

        restockPurchased.push({
          name: item.name,
          quantity: qty,
          cost,
        });

        updatedInventory = updatedInventory.map((inv) => {
          if (inv.id === item.id) {
            let newCurrent = inv.current + qty;
            if (newCurrent > inv.capacity) newCurrent = inv.capacity;
            return { ...inv, current: newCurrent };
          }
          return inv;
        });
      }
    });

    // manual purchases
    manualItems.forEach((item) => {
      manualPurchased.push({
        name: item.name,
        quantity: 1,
        cost: Number(item.price) || 0,
      });
    });

    const restockTotal = restockPurchased.reduce((s, i) => s + i.cost, 0);
    const manualTotal = manualPurchased.reduce((s, i) => s + i.cost, 0);
    const grandTotal = restockTotal + manualTotal;

    // Budget warning BEFORE committing (GROCERY budget only)
    if (monthlyBudget > 0 && grandTotal > 0) {
      const projected = monthlyGroceryTotal + grandTotal;
      if (projected > monthlyBudget) {
        const confirmOver = window.confirm("This purchase exceeds your monthly grocery budget. Continue?");
        if (!confirmOver) return;
      }
    }

    if (grandTotal > 0) {
      const newEntry = {
        id: Date.now(),
        type: "grocery", // explicit type
        date: new Date().toISOString(),
        restockItems: restockPurchased,
        manualItems: manualPurchased,
        restockTotal,
        manualTotal,
        grandTotal,
      };

      addHistoryEntry(newEntry);
    }

    setInventory(updatedInventory);
    localStorage.setItem("inventory", JSON.stringify(updatedInventory));

    setRestockQuantities({});
    setManualItems([]);
    localStorage.removeItem("manualItems"); // clear persisted manual items after purchase
  }

  const restockCost = restockItems.reduce((sum, item) => {
    const qty = Number(restockQuantities[item.id]) || 0;
    return sum + qty * (Number(item.pricePerUnit) || 0);
  }, 0);

  const manualCost = manualItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  const totalCost = restockCost + manualCost;
  const projectedGroceryTotal = monthlyGroceryTotal + totalCost;
const projectedRemainingBudget = monthlyBudget - projectedGroceryTotal;
const projectedBudgetPercent =
  monthlyBudget > 0
    ? Math.min((projectedGroceryTotal / monthlyBudget) * 100, 100)
    : 0;

  // ================= BILLS =================
  const [bills, setBills] = useState(() => {
    const saved = localStorage.getItem("bills");
    const parsed = saved ? JSON.parse(saved) : [];
    // Backward compatible defaults
    return parsed.map((b) => ({
      ...b,
      paidByMonth: b?.paidByMonth || {},
    }));
  });

  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDueDay, setBillDueDay] = useState("");

  function addBill() {
    if (!billName || billAmount === "") return;
    const amt = Number(billAmount);
    const due = Number(billDueDay) || 0;
    if (!Number.isFinite(amt) || amt < 0) return;
    if (!Number.isFinite(due) || due < 0 || due > 31) return;

    const newBill = {
      id: Date.now(),
      name: billName.trim(),
      amount: amt,
      dueDay: due,
      // store paid flags per "YYYY-MM"
      paidByMonth: {},
    };

    const updated = [...bills, newBill];
    setBills(updated);
    localStorage.setItem("bills", JSON.stringify(updated));

    setBillName("");
    setBillAmount("");
    setBillDueDay("");
  }

  function deleteBill(id) {
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    localStorage.setItem("bills", JSON.stringify(updated));
  }

  function toggleBillPaid(id) {
    const ym = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    const updated = bills.map((b) => {
      if (b.id !== id) return b;

      const paidByMonth = { ...(b.paidByMonth || {}) };
      const nextPaid = !paidByMonth[ym];
      paidByMonth[ym] = nextPaid;

      // Add to history ONLY when marking as paid (not when unpaying)
      if (nextPaid) {
        addHistoryEntry({
          id: Date.now(),
          type: "bill",
          date: new Date().toISOString(),
          title: `Bill Payment - ${b.name}`,
          grandTotal: Number(b.amount) || 0,
        });
      }

      return { ...b, paidByMonth };
    });

    setBills(updated);
    localStorage.setItem("bills", JSON.stringify(updated));
  }

  const billsThisMonthTotal = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }, [bills]);

  const billsPaidThisMonthTotal = useMemo(() => {
    const ym = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return bills.reduce((sum, b) => {
      const paid = b.paidByMonth?.[ym];
      return sum + (paid ? Number(b.amount) || 0 : 0);
    }, 0);
  }, [bills, currentYear, currentMonth]);

  // ================= LOANS =================
  const [loans, setLoans] = useState(() => {
    const saved = localStorage.getItem("loans");
    const parsed = saved ? JSON.parse(saved) : [];
    // Backward compatible defaults
    return parsed.map((l) => {
      const bal = Number(l.balance) || 0;
      const orig = Number(l.originalBalance);
      const term = Number(l.term);
      const unit = l.termUnit || "months";
      const freq = l.paymentFrequency || (unit === "weeks" ? "weekly" : unit === "days" ? "daily" : "monthly");
      const manualPaid = Number(l.installmentsPaid);

      return {
        ...l,
        originalBalance: Number.isFinite(orig) && orig > 0 ? orig : bal,
        term: Number.isFinite(term) && term > 0 ? term : 0,
        termUnit: unit,
        paymentFrequency: freq,
        installmentsPaid: Number.isFinite(manualPaid) && manualPaid >= 0 ? manualPaid : 0,
        payments: Array.isArray(l.payments) ? l.payments : [],
        completed:
          !!l.completed ||
          bal <= 0 ||
          ((Number(l.installmentsPaid) || 0) >= (Number(term) || 0) && (Number(term) || 0) > 0),
      };
    });
  });

  const [loanName, setLoanName] = useState("");
  const [loanBalance, setLoanBalance] = useState("");
  const [loanMonthly, setLoanMonthly] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [loanFrequency, setLoanFrequency] = useState("monthly"); // daily|weekly|monthly

  function addLoan() {
    if (!loanName || loanBalance === "" || loanTerm === "") return;

    const bal = Number(loanBalance);
    const mon = Number(loanMonthly) || 0;
    const term = Number(loanTerm);

    if (!Number.isFinite(bal) || bal <= 0) return;
    if (!Number.isFinite(mon) || mon < 0) return;
    if (!Number.isFinite(term) || term <= 0) return;

    const termUnit = loanFrequency === "daily" ? "days" : loanFrequency === "weekly" ? "weeks" : "months";

    const newLoan = {
      id: Date.now(),
      name: loanName.trim(),
      originalBalance: bal, // loan price / principal
      balance: bal,
      paymentAmount: mon, // renamed semantics: per period payment
      paymentFrequency: loanFrequency,
      term, // number of periods
      termUnit,
      installmentsPaid: 0, // manual progress
      payments: [], // [{date, amount}]
      completed: false,
    };

    const updated = [...loans, newLoan];
    setLoans(updated);
    localStorage.setItem("loans", JSON.stringify(updated));

    setLoanName("");
    setLoanBalance("");
    setLoanMonthly("");
    setLoanTerm("");
    setLoanFrequency("monthly");
  }

  function deleteLoan(id) {
    const updated = loans.filter((l) => l.id !== id);
    setLoans(updated);
    localStorage.setItem("loans", JSON.stringify(updated));
  }

  function setLoanInstallmentsPaid(id, paidCountStr) {
    const paidCount = Number(paidCountStr);
    if (!Number.isFinite(paidCount) || paidCount < 0) return;

    const updated = loans.map((l) => {
      if (l.id !== id) return l;
      const term = Number(l.term) || 0;
      const next = term > 0 ? Math.min(term, Math.floor(paidCount)) : Math.floor(paidCount);
      const completed = (term > 0 && next >= term) || (Number(l.balance) || 0) <= 0;
      return { ...l, installmentsPaid: next, completed };
    });

    setLoans(updated);
    localStorage.setItem("loans", JSON.stringify(updated));
  }

  function payLoan(id, amountStr) {
    const amt = Number(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) return;

    const loanBefore = loans.find((l) => l.id === id);
    if (!loanBefore) return;
    if (loanBefore.completed) return;

    const updated = loans.map((l) => {
      if (l.id !== id) return l;

      const newBal = Math.max(0, (Number(l.balance) || 0) - amt);

      // installments progress (1 payment = 1 installment)
      const term = Number(l.term) || 0;
      const nextInstallments =
        term > 0
          ? Math.min(term, (Number(l.installmentsPaid) || 0) + 1)
          : (Number(l.installmentsPaid) || 0) + 1;

      const completed = (term > 0 && nextInstallments >= term) || newBal <= 0;

      const payments = [{ date: new Date().toISOString(), amount: amt }, ...(l.payments || [])];

      return {
        ...l,
        balance: newBal,
        installmentsPaid: nextInstallments,
        completed,
        payments,
      };
    });

    setLoans(updated);
    localStorage.setItem("loans", JSON.stringify(updated));

    // Add loan payment to history
    addHistoryEntry({
      id: Date.now(),
      type: "loan",
      date: new Date().toISOString(),
      title: `Loan Payment - ${loanBefore.name}`,
      grandTotal: amt,
    });
  }

  // ================= TOP SUMMARY (moved above H1) =================
  const TopMonthlySummary = () => (
    <div style={{ border: "2px solid #333", padding: 16, marginBottom: 18, borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Monthly Summary</h3>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Groceries (This Month)</span>
        <strong>{formatPHP(monthlyGroceryTotal)}</strong>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>Loans Paid (This Month)</span>
        <strong>{formatPHP(monthlyLoanTotal)}</strong>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>Bills Paid (This Month)</span>
        <strong>{formatPHP(monthlyBillTotal)}</strong>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: "bold", marginTop: 10 }}>
        <span>Total Monthly Expenditures</span>
        <span>{formatPHP(monthlyOverallTotal)}</span>
      </div>

      <div style={{ marginTop: 10, opacity: 0.9 }}>Grocery Trips: {thisMonthGroceryEntries.length}</div>
      <div style={{ opacity: 0.9 }}>Highest Grocery Trip: {formatPHP(highestTrip)}</div>
    </div>
  );

  // ================= UI =================
  return (
    <div className="app-container">
      {/* moved here: monthly summary ABOVE the H1 */}
      <TopMonthlySummary />

      <h1>Home Ledger</h1>

      <nav className="nav-tabs">
        {["inventory", "grocery", "bills", "loans", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`nav-button ${activeTab === tab ? "active" : ""}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* ================= INVENTORY TAB ================= */}
      {activeTab === "inventory" && (
        <div>
          <h2>Add Item</h2>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            <input placeholder="Capacity" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <input placeholder="Current" type="number" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input
              placeholder="Restock alert at"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <input
              placeholder="Price per unit (PHP)"
              type="number"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
            />
            <button onClick={addItem}>Add</button>
          </div>

          <h2 style={{ marginTop: "24px" }}>Items</h2>

          {inventory.length === 0 && <p>No items yet.</p>}

          {inventory.map((item) => {
            const percent = item.capacity > 0 ? (item.current / item.capacity) * 100 : 0;
            const low = item.current <= item.threshold;

            return (
              <div
                key={item.id}
                style={{ border: "1px solid #ccc", padding: "12px", marginBottom: "10px", borderRadius: "8px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <strong>{item.name}</strong>
                  <button onClick={() => deleteInventoryItem(item.id)}>Delete</button>
                </div>

                <div>
                  {item.current} / {item.capacity}
                </div>
                <div>Price: {formatPHP(item.pricePerUnit)}</div>

                <div style={{ height: "8px", background: "#eee", borderRadius: "4px", margin: "8px 0" }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, percent))}%`,
                      height: "100%",
                      background: low ? "red" : "#333",
                      borderRadius: "4px",
                    }}
                  />
                </div>

                {low && <div style={{ color: "red" }}>⚠ Restock soon</div>}

                <input type="number" value={item.current} onChange={(e) => updateCurrent(item.id, e.target.value)} />
              </div>
            );
          })}
        </div>
      )}

      {/* ================= GROCERY TAB ================= */}
      {activeTab === "grocery" && (
        <div>
          {/* Grocery budget panel INSIDE grocery tab (above Restock) */}
          <div style={{ border: "2px solid #333", padding: 14, borderRadius: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: "bold" }}>Grocery Budget (This Month)</div>
              <div>
                Spent (incl. cart): {formatPHP(projectedGroceryTotal)}
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="number"
                placeholder="Set Monthly Grocery Budget"
                value={monthlyBudget || ""}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setMonthlyBudget(value);
                  localStorage.setItem("monthlyBudget", String(value));
                }}
              />
              {monthlyBudget > 0 && (
                <div style={{ fontWeight: "bold", color: monthlyGroceryTotal > monthlyBudget ? "red" : "green" }}>
                  {projectedGroceryTotal > monthlyBudget ? "⚠ Budget Exceeded" : "Within Budget"}
                </div>
              )}
            </div>

            {monthlyBudget > 0 && (
              <>
                <div style={{ marginTop: 8 }}>
                  Remaining:{" "}
                  <strong style={{ color: remainingBudget < 0 ? "red" : "green" }}>
                    {formatPHP(projectedRemainingBudget)}
                  </strong>
                </div>

                <div style={{ height: 10, background: "#eee", borderRadius: 6, marginTop: 8 }}>
                  <div
                    style={{
                      width: `${projectedBudgetPercent}%`,
                      height: "100%",
                      background: budgetPercent >= 100 ? "red" : "#333",
                      borderRadius: 6,
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <h2>Restock Checklist</h2>

          {restockItems.length === 0 && <p>No items need restocking.</p>}

          {restockItems.map((item) => {
            const qty = Number(restockQuantities[item.id]) || 0;
            const cost = qty * (Number(item.pricePerUnit) || 0);
            const neededToMax = Math.max(0, (Number(item.capacity) || 0) - (Number(item.current) || 0));

            return (
              <div
                key={item.id}
                style={{ border: "1px solid #ccc", padding: "12px", marginBottom: "10px", borderRadius: "8px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{item.name}</strong>
                  <span style={{ fontWeight: "bold" }}>{formatPHP(cost)}</span>
                </div>

                <div style={{ marginTop: 4 }}>Price per unit: {formatPHP(item.pricePerUnit)}</div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <input
                    type="number"
                    placeholder="Qty bought"
                    value={restockQuantities[item.id] || ""}
                    onChange={(e) => handleRestockQtyChange(item.id, e.target.value)}
                  />
                  <span style={{ opacity: 0.8 }}>Cost: {formatPHP(cost)}</span>

                  {/* Fill to Max */}
                  <button
                    onClick={() => handleRestockQtyChange(item.id, neededToMax)}
                    style={{ border: "1px solid #ccc", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                  >
                    Fill to Max ({neededToMax})
                  </button>
                </div>
              </div>
            );
          })}

          {/* Subtotal label for restock */}
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: "bold",
            }}
          >
            <span>Restock Subtotal</span>
            <span>{formatPHP(restockCost)}</span>
          </div>

          <h2 style={{ marginTop: "24px" }}>Manual Items</h2>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input placeholder="Item name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
            <input placeholder="Price" type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
            <button onClick={addManualItem}>Add</button>
          </div>

          {manualItems.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #ccc",
                padding: "10px 12px",
                marginTop: 8,
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span>
                {item.name} <strong style={{ marginLeft: 8 }}>{formatPHP(item.price)}</strong>
              </span>
              <button onClick={() => deleteManualItem(item.id)}>Delete</button>
            </div>
          ))}

          {/* Subtotal label for manual */}
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: "bold",
            }}
          >
            <span>Manual Subtotal</span>
            <span>{formatPHP(manualCost)}</span>
          </div>

          {/* Grand total BIG */}
          <div
            style={{
              marginTop: 14,
              padding: "14px 12px",
              border: "2px solid #333",
              borderRadius: 12,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 20,
              fontWeight: "bold",
            }}
          >
            <span>Grand Total</span>
            <span>{formatPHP(totalCost)}</span>
          </div>

          {(restockItems.length > 0 || manualItems.length > 0) && (
            <button style={{ marginTop: 14 }} onClick={completePurchase}>
              Complete Purchase
            </button>
          )}
        </div>
      )}

      {/* ================= BILLS TAB ================= */}
      {activeTab === "bills" && (
        <div>
          <h2>Bills</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Bill name" value={billName} onChange={(e) => setBillName(e.target.value)} />
            <input
              placeholder="Amount (PHP)"
              type="number"
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value)}
            />
            <input
              placeholder="Due day (1-31)"
              type="number"
              value={billDueDay}
              onChange={(e) => setBillDueDay(e.target.value)}
            />
            <button onClick={addBill}>Add</button>
          </div>

          <div style={{ marginTop: 16, border: "2px solid #333", padding: 14, borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total Bills (This Month)</span>
              <strong>{formatPHP(billsThisMonthTotal)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span>Paid</span>
              <strong>{formatPHP(billsPaidThisMonthTotal)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span>Remaining</span>
              <strong>{formatPHP(billsThisMonthTotal - billsPaidThisMonthTotal)}</strong>
            </div>
          </div>

          {bills.length === 0 && <p style={{ marginTop: 14 }}>No bills added yet.</p>}

          {bills.map((b) => {
            const ym = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
            const paid = !!b.paidByMonth?.[ym];

            return (
              <div
                key={b.id}
                style={{ border: "1px solid #ccc", padding: 12, marginTop: 12, borderRadius: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong>{b.name}</strong>
                  <button onClick={() => deleteBill(b.id)}>Delete</button>
                </div>

                <div style={{ marginTop: 6 }}>Amount: {formatPHP(b.amount)}</div>
                <div>Due Day: {b.dueDay || "-"}</div>

                <button
                  onClick={() => toggleBillPaid(b.id)}
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: paid ? "#2e7d32" : "#f3f3f3",
                    color: paid ? "white" : "black",
                    cursor: "pointer",
                  }}
                >
                  {paid ? "Paid" : "Mark as Paid"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= LOANS TAB ================= */}
      {activeTab === "loans" && (
        <div>
          <h2>Loans</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Loan name" value={loanName} onChange={(e) => setLoanName(e.target.value)} />
            <input
              placeholder="Loan price / principal (PHP)"
              type="number"
              value={loanBalance}
              onChange={(e) => setLoanBalance(e.target.value)}
            />
            <input
              placeholder="Payment amount (per term)"
              type="number"
              value={loanMonthly}
              onChange={(e) => setLoanMonthly(e.target.value)}
            />

            {/* NEW: Frequency dropdown */}
            <select value={loanFrequency} onChange={(e) => setLoanFrequency(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>

            {/* Term input */}
            <input
              placeholder={`Term (# of ${loanFrequency === "daily" ? "days" : loanFrequency === "weekly" ? "weeks" : "months"}) e.g. 24`}
              type="number"
              value={loanTerm}
              onChange={(e) => setLoanTerm(e.target.value)}
            />
            <button onClick={addLoan}>Add</button>
          </div>

          {loans.length === 0 && <p style={{ marginTop: 14 }}>No loans added yet.</p>}

          {loans.map((l) => (
            <LoanCard
              key={l.id}
              loan={l}
              formatPHP={formatPHP}
              onDelete={deleteLoan}
              onPay={payLoan}
              onSetPaid={setLoanInstallmentsPaid}
            />
          ))}
        </div>
      )}

      {/* ================= HISTORY TAB ================= */}
      {activeTab === "history" && (
        <div>
          <h2>Purchase History</h2>

          <button
            onClick={clearAllHistory}
            style={{
              marginBottom: "16px",
              background: "#c62828",
              color: "white",
              padding: "8px 12px",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Clear All History
          </button>

          {purchaseHistory.length === 0 && <p>No purchases yet.</p>}

          {purchaseHistory.map((entry) => {
            const entryType = normalizeEntryType(entry);

            const cardBg =
              entryType === "loan"
                ? "#e3f2fd"
                : entryType === "bill"
                ? "#fff3e0"
                : "white";

            return (
              <div
                key={entry.id}
                style={{
                  border: "1px solid #ccc",
                  padding: "16px",
                  marginBottom: "16px",
                  borderRadius: "10px",
                  background: cardBg,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{new Date(entry.date).toLocaleString()}</strong>
                  <button
                    onClick={() => deleteHistoryEntry(entry.id)}
                    style={{
                      background: "transparent",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>

                {/* Bill/Loan simplified display */}
                {(entryType === "bill" || entryType === "loan") && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: "bold" }}>
                      {entry.title || (entryType === "bill" ? "Bill Payment" : "Loan Payment")}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 20, fontWeight: "bold", textAlign: "right" }}>
                      Total: {formatPHP(entry.grandTotal)}
                    </div>
                  </div>
                )}

                {/* Grocery display preserved */}
                {entryType === "grocery" && (
                  <>
                    {entry.restockItems?.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                          <span>Restock Items</span>
                          <span>{formatPHP(entry.restockTotal)}</span>
                        </div>
                        {entry.restockItems.map((item, i) => (
                          <div key={i} style={{ paddingLeft: "12px" }}>
                            {item.name} x{item.quantity}
                            <span style={{ float: "right" }}>{formatPHP(item.cost)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {entry.manualItems?.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                          <span>Manual Items</span>
                          <span>{formatPHP(entry.manualTotal)}</span>
                        </div>
                        {entry.manualItems.map((item, i) => (
                          <div key={i} style={{ paddingLeft: "12px" }}>
                            {item.name} x{item.quantity}
                            <span style={{ float: "right" }}>{formatPHP(item.cost)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: "16px", fontSize: "20px", fontWeight: "bold", textAlign: "right" }}>
                      Grand Total: {formatPHP(entry.grandTotal)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, formatPHP, onDelete, onPay, onSetPaid }) {
  const [payAmount, setPayAmount] = useState("");
  const [manualPaid, setManualPaid] = useState(String(Number(loan.installmentsPaid) || 0));

  const term = Number(loan.term) || 0;
  const paid = Number(loan.installmentsPaid) || 0;

  const progressPercent = term > 0 ? Math.min((paid / term) * 100, 100) : 0;

  const paymentAmount = Number(loan.paymentAmount ?? loan.monthlyPayment ?? 0) || 0;
  const scheduledTotal = term > 0 ? paymentAmount * term : 0;

  const totalPaid = Array.isArray(loan.payments)
    ? loan.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    : 0;

  const principal = Number(loan.originalBalance) || Number(loan.balance) || 0;
  const estInterest = scheduledTotal > 0 ? Math.max(0, scheduledTotal - principal) : 0;

  const scheduledRemaining = scheduledTotal > 0 ? Math.max(0, scheduledTotal - totalPaid) : 0;

  const unitLabel =
    loan.paymentFrequency === "daily"
      ? "day"
      : loan.paymentFrequency === "weekly"
      ? "week"
      : "month";

  return (
    <div style={{ border: "1px solid #ccc", padding: 12, marginTop: 12, borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <strong>{loan.name}</strong>
        <button onClick={() => onDelete(loan.id)}>Delete</button>
      </div>

      <div style={{ marginTop: 6 }}>
        Loan Price (Principal): <strong>{formatPHP(principal)}</strong>
      </div>

      <div style={{ marginTop: 6 }}>
        Remaining Balance: <strong>{formatPHP(loan.balance)}</strong>
      </div>

      <div>
        Payment: {paymentAmount ? `${formatPHP(paymentAmount)} / ${unitLabel}` : "-"}
        {term > 0 ? ` • Term: ${term} ${term === 1 ? unitLabel : unitLabel + "s"}` : ""}
      </div>

      {/* Term Progress with manual edit */}
      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          Term Progress:{" "}
          <strong>
            {paid} / {term || "-"}
          </strong>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            min="0"
            placeholder="Set paid terms"
            value={manualPaid}
            onChange={(e) => setManualPaid(e.target.value)}
            style={{ width: 140 }}
          />
          <button
            onClick={() => {
              onSetPaid(loan.id, manualPaid);
            }}
          >
            Update Paid Terms
          </button>
        </div>
      </div>

      <div style={{ height: 10, background: "#eee", borderRadius: 6, marginTop: 8 }}>
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: loan.completed ? "#2e7d32" : "#333",
            borderRadius: 6,
          }}
        />
      </div>

      {/* Totals / interest snapshot */}
      <div style={{ marginTop: 10, border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Total Paid (records)</span>
          <strong>{formatPHP(totalPaid)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span>Scheduled Total (payment × term)</span>
          <strong>{scheduledTotal > 0 ? formatPHP(scheduledTotal) : "-"}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span>Scheduled Remaining</span>
          <strong>{scheduledTotal > 0 ? formatPHP(scheduledRemaining) : "-"}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span>Estimated Interest</span>
          <strong>{scheduledTotal > 0 ? formatPHP(estInterest) : "-"}</strong>
        </div>
      </div>

      {!loan.completed ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <input
            type="number"
            placeholder="Payment amount"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <button
            onClick={() => {
              onPay(loan.id, payAmount);
              setPayAmount("");
            }}
          >
            Pay
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontWeight: "bold", color: "#2e7d32" }}>✅ Fully Paid</div>
      )}

      {loan.payments?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 6 }}>Payments</div>
          {loan.payments.slice(0, 5).map((p, idx) => (
            <div key={idx} style={{ paddingLeft: 8, opacity: 0.9 }}>
              {new Date(p.date).toLocaleString()} <span style={{ float: "right" }}>{formatPHP(p.amount)}</span>
            </div>
          ))}
          {loan.payments.length > 5 && (
            <div style={{ paddingLeft: 8, opacity: 0.7, marginTop: 4 }}>
              …and {loan.payments.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
