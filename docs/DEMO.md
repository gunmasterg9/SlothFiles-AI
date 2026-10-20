# SlothPilot AI: Demonstration Walkthrough Guide

This walkthrough guides you through an end-to-end demonstration of SlothPilot AI across all five integrated modules.

---

## 🚀 Launching the Demo Environment

1. Ensure services are running:
   ```powershell
   .\scripts\start.ps1
   ```
2. Open your browser to [http://127.0.0.1:5173](http://127.0.0.1:5173).

---

## Step 1: Register an Approved Directory Root

1. Navigate to the **Settings & Audit** tab in the sidebar.
2. In the **Approved Directory Roots** card, enter a folder path (e.g. `C:\Users\RAHUL\Documents\TestSpace`) and label it `Demo Workspace`.
3. Click **Approve Root**.
4. Notice that:
   - The directory appears in the approved roots list.
   - An immutable entry is recorded in the **Append-Only Audit Log** below.

---

## Step 2: Smart File Organizer & Duplicate Detection

1. Place sample documents in your approved directory:
   - `Invoice_Acme.pdf`
   - `Invoice_Acme_copy.pdf` (duplicate copy)
   - `Meeting_Notes.docx`
   - `Project_Budget.xlsx`
2. Navigate to the **File Organizer** tab.
3. The approved path is automatically pre-filled in the folder input.
4. Click **Scan & Plan Organization**.
5. Observe:
   - Streaming SHA-256 computation identifies `Invoice_Acme_copy.pdf` as an exact duplicate of `Invoice_Acme.pdf`.
   - Text is extracted from PDF, DOCX, and XLSX files.
   - The local model (or deterministic fallback) proposes destination folders (`Invoices & Receipts`, `Duplicates`, `Documents & Notes`).
   - A proposed Action Plan is generated and routed to the **Approvals** queue. **No files are moved yet.**

---

## Step 3: Review and Execute Action Approvals

1. Navigate to the **Approvals** tab (notice the badge count `1`).
2. Inspect the proposed plan:
   - Each proposed move shows source path, target destination, reason, and risk level.
3. Click **Approve**.
4. Preconditions are revalidated (source existence, SHA-256 match, collision freedom); the files are moved into their category folders.
5. Notice the **Undo** button in the completed plan card. Clicking **Undo** immediately restores all moved files back to their original positions safely.

---

## Step 4: LazyDesk Folder Monitoring

1. Navigate to the **LazyDesk Automation** tab.
2. Enter your approved directory and click **Start Watching**.
3. A Watchdog monitor is created with 2-second debouncing and internal loop prevention.
4. Drop a new file into the folder; observe a background task spawned in the **Task History** tab.
5. Test the **Pause** and **Resume** buttons to control monitoring.

---

## Step 5: Inbox & Notes Assistant

1. Navigate to the **Inbox & Notes** tab.
2. Under **Import Document or Email**, provide a path to a text note or `.eml` file:
   - *Example content*: "Team sync on 2026-10-25: Alice to finalize budget draft by next Thursday. Urgent: Bob to review shipment variances."
3. Click **Import File**.
4. Click **Run AI Analysis**:
   - **Executive Summary**: Synthesized overview of the document.
   - **Action Items**: "Finalize budget draft" (Assignee: Alice, Urgency: High) with exact source quote citations.
   - **Date Evidence**: Normalized dates with ambiguity flags (flagging "next Thursday").
   - **Local Draft Reply**: Generates a professional draft response stored locally with a **Copy Draft** button.

---

## Step 6: TradeSloth Document Auditor

1. Navigate to the **TradeSloth Auditor** tab.
2. In the document paths input, provide paths to 2 or 3 shipment documents:
   - Commercial Invoice: `Invoice #101, Total: $12,500.00 USD, 50 cartons, Gross Weight: 1250 kg`
   - Packing List: `Invoice #101, 48 cartons, Gross Weight: 1250 kg`
3. Click **Run Cross-Document Audit**.
4. Observe the **Cross-Document Discrepancy Matrix**:
   - `package_count`: Flagged with **INCONSISTENT** (Variance: -2.00 cartons) with evidence citations.
   - `gross_weight`: Marked **VERIFIED** with matching values.
   - Prominent statutory disclaimer: *"TradeSloth findings highlight cross-document variances for human review and do not constitute legal or statutory customs advice."*
5. Click **Export Report** to view and copy the standalone Markdown audit report.

---

## Step 7: Local AI Copilot & Restricted Tools

1. Navigate to the **Local Copilot** tab.
2. Notice the **Tool Registry** sidebar showing registered sandboxed tools:
   - `get_system_status` (READ_ONLY)
   - `list_approved_roots` (READ_ONLY)
   - `get_audit_findings` (READ_ONLY)
   - `get_task_status` (READ_ONLY)
   - `propose_file_organization` (PROPOSE_PLAN)
3. Click the suggested prompt: **"Summarize any discrepancies in TradeSloth audits."**
4. The copilot calls `get_audit_findings` and explains the package count variance clearly.
5. Type: **"Please organize the files in my approved folder."**
6. The copilot executes `propose_file_organization`, prepares an action plan, and presents a **"Review in Approvals"** button. The operation is safely gated in the approvals queue.

---

## Step 8: Safe Shutdown

When finished with the demonstration:
```powershell
.\scripts\stop.ps1
```
All backend and frontend background processes are terminated cleanly.
