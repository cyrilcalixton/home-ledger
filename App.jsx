
import { useMemo, useState } from "react";

function App() {
  const [activeTab, setActiveTab] = useState("inventory");

  const formatPHP = (value) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(value) || 0);

  // ================= HISTORY =================
  const [purchaseHistory, setPurchaseHistory] = useState(() => {
    const saved = localStorage.getItem("purchaseHistory");
    return saved ? JSON.parse(saved) : [];
  });

  function normalizeEntryType(entry) {
    if (entry?.type) return entry.type;
    if (entry?.restockItems || entry?.manualItems) return "grocery";
    return "grocery";
  }

  function addHistoryEntry(newEntry) {
    const updated = [newEntry, ...purchaseHistory];
    setPurchaseHistory(updated);
    localStorage.setItem("purchaseHistory", JSON.stringify(updated));
  }

  function deleteHistoryEntry(id) {
    const updated = purchaseHistory.filter((e) => e.id !== id);
    setPurchaseHistory(updated);
    localStorage.setItem("purchaseHistory", JSON.stringify(updated));
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthEntries = useMemo(() => {
    return purchaseHistory.filter((entry) => {
      const d = new Date(entry.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [purchaseHistory, currentMonth, currentYear]);

  const monthlyGroceryTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "grocery")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyLoanTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "loan")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyBillTotal = thisMonthEntries
    .filter((e) => normalizeEntryType(e) === "bill")
    .reduce((s, e) => s + (Number(e.grandTotal) || 0), 0);

  const monthlyOverallTotal =
    monthlyGroceryTotal + monthlyLoanTotal + monthlyBillTotal;

  const thisMonthGroceryEntries = thisMonthEntries.filter(
    (e) => normalizeEntryType(e) === "grocery"
  );

  const highestTrip =
    thisMonthGroceryEntries.length > 0
      ? Math.max(
          ...thisMonthGroceryEntries.map(
            (e) => Number(e.grandTotal) || 0
          )
        )
      : 0;

  // ================= GROCERY BUDGET =================
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const saved = localStorage.getItem("monthlyBudget");
    return saved ? Number(saved) : 0;
  });

  const remainingBudget = monthlyBudget - monthlyGroceryTotal;
  const budgetPercent =
    monthlyBudget > 0
      ? Math.min((monthlyGroceryTotal / monthlyBudget) * 100, 100)
      : 0;

  // ================= UI =================
  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      
      {/* GLOBAL MONTHLY SUMMARY - MOVED ABOVE H1 */}
      <div style={{ border: "2px solid #333", padding: 16, marginBottom: 20, borderRadius: 12 }}>
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

        <div style={{ marginTop: 10 }}>Grocery Trips: {thisMonthGroceryEntries.length}</div>
        <div>Highest Grocery Trip: {formatPHP(highestTrip)}</div>
      </div>

      <h1>Home Ledger</h1>

      <nav style={{ marginBottom: 24, display: "flex", gap: 10 }}>
        {["inventory", "grocery", "bills", "loans", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: activeTab === tab ? "#333" : "#f3f3f3",
              color: activeTab === tab ? "white" : "black",
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* GROCERY TAB */}
      {activeTab === "grocery" && (
        <div>
          {/* BUDGET MOVED INSIDE GROCERY TAB */}
          <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 10, marginBottom: 20 }}>
            <div style={{ fontWeight: "bold" }}>Monthly Grocery Budget</div>

            <input
              type="number"
              placeholder="Set Monthly Budget"
              value={monthlyBudget || ""}
              onChange={(e) => {
                const value = Number(e.target.value);
                setMonthlyBudget(value);
                localStorage.setItem("monthlyBudget", String(value));
              }}
              style={{ marginTop: 8 }}
            />

            {monthlyBudget > 0 && (
              <>
                <div
                  style={{
                    marginTop: 8,
                    fontWeight: "bold",
                    color:
                      monthlyGroceryTotal > monthlyBudget ? "red" : "green",
                  }}
                >
                  {monthlyGroceryTotal > monthlyBudget
                    ? "⚠ Grocery Budget Exceeded"
                    : "Grocery Budget OK"}
                </div>

                <div style={{ marginTop: 6 }}>
                  Remaining Budget:{" "}
                  <strong style={{ color: remainingBudget < 0 ? "red" : "green" }}>
                    {formatPHP(remainingBudget)}
                  </strong>
                </div>

                <div style={{ height: 10, background: "#eee", borderRadius: 6, marginTop: 8 }}>
                  <div
                    style={{
                      width: `${budgetPercent}%`,
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
        </div>
      )}

      {/* HISTORY TAB - CLEANED */}
      {activeTab === "history" && (
        <div>
          <h2>Purchase History</h2>

          {purchaseHistory.length === 0 && <p>No purchases yet.</p>}

          {purchaseHistory.map((entry) => {
            const entryType = normalizeEntryType(entry);
            const bg =
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
                  padding: 16,
                  marginBottom: 16,
                  borderRadius: 10,
                  background: bg,
                }}
              >
                <strong>{new Date(entry.date).toLocaleString()}</strong>
                <div style={{ marginTop: 8, fontWeight: "bold" }}>
                  {formatPHP(entry.grandTotal)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;
