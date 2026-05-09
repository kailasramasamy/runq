// ─── Mock data for AR module ────────────────────────────────────────────────

const AR_CUSTOMERS = [
  { id: "cus_001", name: "Tata Consultancy Services", nickname: "TCS", type: "b2b", email: "ap@tcs.com", phone: "+91 22 6778 9999", contactPerson: "Rohan Mehta", gstin: "27AAACT2727Q1ZW", pan: "AAACT2727Q", paymentTermsDays: 45, creditLimit: 5000000, addressLine1: "Nirmal Building, 9th Floor", addressLine2: "Nariman Point", city: "Mumbai", state: "Maharashtra", pincode: "400021", isActive: true, outstandingAmount: 1284000, creditScore: 92, riskLevel: "low" },
  { id: "cus_002", name: "Wipro Limited", nickname: "Wipro", type: "b2b", email: "vendors@wipro.com", phone: "+91 80 2844 0011", contactPerson: "Priya Subramaniam", gstin: "29AAACW0387D1Z3", pan: "AAACW0387D", paymentTermsDays: 30, creditLimit: 3000000, addressLine1: "Doddakannelli, Sarjapur Road", city: "Bengaluru", state: "Karnataka", pincode: "560035", isActive: true, outstandingAmount: 624500, creditScore: 88, riskLevel: "low" },
  { id: "cus_003", name: "Infosys Technologies", nickname: "Infosys", type: "b2b", email: "ap.team@infosys.com", phone: "+91 80 2852 0261", contactPerson: "Karthik Iyer", gstin: "29AAACI4741P1Z6", pan: "AAACI4741P", paymentTermsDays: 30, creditLimit: 4000000, addressLine1: "Plot 44, Electronics City", city: "Bengaluru", state: "Karnataka", pincode: "560100", isActive: true, outstandingAmount: 318900, creditScore: 90, riskLevel: "low" },
  { id: "cus_004", name: "Sharma Steel Industries", nickname: "Sharma Steel", type: "b2b", email: "accounts@sharmasteel.in", phone: "+91 79 2754 4421", contactPerson: "Mukesh Sharma", gstin: "24AABCS9012F1ZK", pan: "AABCS9012F", paymentTermsDays: 60, creditLimit: 1500000, addressLine1: "Plot 412, GIDC Phase II", city: "Ahmedabad", state: "Gujarat", pincode: "382445", isActive: true, outstandingAmount: 412800, creditScore: 64, riskLevel: "medium" },
  { id: "cus_005", name: "Reliance Retail", nickname: "Reliance", type: "b2b", email: "vendor.payable@ril.com", phone: "+91 22 3555 5000", contactPerson: "Anjali Kapoor", gstin: "27AAACR5055K1Z7", pan: "AAACR5055K", paymentTermsDays: 90, creditLimit: 8000000, addressLine1: "Maker Chambers IV, Nariman Point", city: "Mumbai", state: "Maharashtra", pincode: "400021", isActive: true, outstandingAmount: 1842000, creditScore: 86, riskLevel: "low" },
  { id: "cus_006", name: "Mahindra Logistics", nickname: "Mahindra", type: "b2b", email: "ap@mahindralogistics.com", phone: "+91 22 2490 1441", contactPerson: "Sandeep Patil", gstin: "27AAFCM7891H1ZD", pan: "AAFCM7891H", paymentTermsDays: 45, creditLimit: 2000000, addressLine1: "Mahindra Towers, Worli", city: "Mumbai", state: "Maharashtra", pincode: "400018", isActive: true, outstandingAmount: 156800, creditScore: 82, riskLevel: "low" },
  { id: "cus_007", name: "Bharti Airtel", nickname: "Airtel", type: "b2b", email: "supplier.help@airtel.com", phone: "+91 124 422 2222", contactPerson: "Rahul Bansal", gstin: "06AAACB2894G1ZK", pan: "AAACB2894G", paymentTermsDays: 60, creditLimit: 6000000, addressLine1: "Airtel Center, Plot 16", city: "Gurugram", state: "Haryana", pincode: "122015", isActive: true, outstandingAmount: 248000, creditScore: 88, riskLevel: "low" },
  { id: "cus_008", name: "Amazon Pay India", nickname: "Amazon", type: "payment_gateway", email: "settlements@amazonpay.in", phone: "+91 80 4197 0000", contactPerson: "Akash Nair", gstin: "29AAFCA1234E1ZB", pan: "AAFCA1234E", paymentTermsDays: 7, creditLimit: 0, addressLine1: "Brigade Gateway, Rajajinagar", city: "Bengaluru", state: "Karnataka", pincode: "560055", isActive: true, outstandingAmount: 0, creditScore: 95, riskLevel: "low" },
  { id: "cus_009", name: "Aditya Birla Fashion", nickname: "ABFRL", type: "b2b", email: "ap@abfrl.adityabirla.com", phone: "+91 22 4356 9800", contactPerson: "Neha Kothari", gstin: "27AAACA9712G1Z2", pan: "AAACA9712G", paymentTermsDays: 75, creditLimit: 3500000, addressLine1: "Piramal Agastya, LBS Marg", city: "Mumbai", state: "Maharashtra", pincode: "400070", isActive: true, outstandingAmount: 884200, creditScore: 78, riskLevel: "low" },
  { id: "cus_010", name: "Vedanta Resources", nickname: "Vedanta", type: "b2b", email: "ap.central@vedanta.co.in", phone: "+91 124 459 3000", contactPerson: "Anil Joshi", gstin: "06AABCS9418F1Z9", pan: "AABCS9418F", paymentTermsDays: 90, creditLimit: 4500000, addressLine1: "Tower A, DLF Atria", city: "Gurugram", state: "Haryana", pincode: "122002", isActive: true, outstandingAmount: 542000, creditScore: 58, riskLevel: "high" },
  { id: "cus_011", name: "Godrej Properties", nickname: "Godrej", type: "b2b", email: "vendor.support@godrejproperties.com", phone: "+91 22 6169 8500", contactPerson: "Kavita Rao", gstin: "27AAACG3030R1ZW", pan: "AAACG3030R", paymentTermsDays: 60, creditLimit: 2500000, addressLine1: "Godrej One, Pirojshanagar", city: "Mumbai", state: "Maharashtra", pincode: "400079", isActive: true, outstandingAmount: 192500, creditScore: 84, riskLevel: "low" },
  { id: "cus_012", name: "Larsen & Toubro", nickname: "L&T", type: "b2b", email: "ap.engineering@larsentoubro.com", phone: "+91 22 6752 5656", contactPerson: "Vikram Desai", gstin: "27AAACL0140P1Z6", pan: "AAACL0140P", paymentTermsDays: 60, creditLimit: 5500000, addressLine1: "L&T House, Ballard Estate", city: "Mumbai", state: "Maharashtra", pincode: "400001", isActive: false, outstandingAmount: 0, creditScore: 90, riskLevel: "low" },
];

const INV_STATUS = ["draft", "sent", "viewed", "partially_paid", "paid", "overdue", "cancelled"];

const AR_INVOICES = [
  { id: "inv_001", invoiceNumber: "INV-2026-0142", customerId: "cus_001", customerName: "Tata Consultancy Services", issueDate: "2026-04-12", dueDate: "2026-05-27", totalAmount: 684000, balanceDue: 684000, taxAmount: 104339, status: "sent", currency: "INR", reference: "PO-TCS-9921", lineCount: 6, hasEinvoice: true, irn: "1f2c…8a92" },
  { id: "inv_002", invoiceNumber: "INV-2026-0141", customerId: "cus_005", customerName: "Reliance Retail", issueDate: "2026-04-08", dueDate: "2026-07-07", totalAmount: 1842000, balanceDue: 1842000, taxAmount: 280983, status: "viewed", currency: "INR", reference: "PO-RIL-78812", lineCount: 12, hasEinvoice: true, irn: "9ab2…4c81" },
  { id: "inv_003", invoiceNumber: "INV-2026-0140", customerId: "cus_004", customerName: "Sharma Steel Industries", issueDate: "2026-03-22", dueDate: "2026-05-21", totalAmount: 412800, balanceDue: 412800, taxAmount: 62969, status: "overdue", currency: "INR", reference: "PO-SS-4421", lineCount: 4, hasEinvoice: true, irn: "3d8c…91f0" },
  { id: "inv_004", invoiceNumber: "INV-2026-0139", customerId: "cus_010", customerName: "Vedanta Resources", issueDate: "2026-03-18", dueDate: "2026-06-16", totalAmount: 542000, balanceDue: 542000, taxAmount: 82678, status: "overdue", currency: "INR", reference: "PO-VED-2218", lineCount: 8, hasEinvoice: true, irn: "7e4a…2b15" },
  { id: "inv_005", invoiceNumber: "INV-2026-0138", customerId: "cus_009", customerName: "Aditya Birla Fashion", issueDate: "2026-03-15", dueDate: "2026-05-29", totalAmount: 884200, balanceDue: 484200, taxAmount: 134878, status: "partially_paid", currency: "INR", reference: "PO-ABFRL-7712", lineCount: 9, hasEinvoice: true, irn: "5f9a…cd33" },
  { id: "inv_006", invoiceNumber: "INV-2026-0137", customerId: "cus_002", customerName: "Wipro Limited", issueDate: "2026-04-02", dueDate: "2026-05-02", totalAmount: 624500, balanceDue: 624500, taxAmount: 95263, status: "sent", currency: "INR", reference: "PO-WIPRO-3309", lineCount: 5, hasEinvoice: true, irn: "8c1d…6e44" },
  { id: "inv_007", invoiceNumber: "INV-2026-0136", customerId: "cus_007", customerName: "Bharti Airtel", issueDate: "2026-03-28", dueDate: "2026-05-27", totalAmount: 248000, balanceDue: 248000, taxAmount: 37831, status: "viewed", currency: "INR", reference: "PO-AIRTEL-5512", lineCount: 3, hasEinvoice: true, irn: "2a6b…f188" },
  { id: "inv_008", invoiceNumber: "INV-2026-0135", customerId: "cus_003", customerName: "Infosys Technologies", issueDate: "2026-03-25", dueDate: "2026-04-24", totalAmount: 318900, balanceDue: 0, taxAmount: 48646, status: "paid", currency: "INR", reference: "PO-INFY-9942", lineCount: 4, hasEinvoice: true, irn: "4d8e…b2c1" },
  { id: "inv_009", invoiceNumber: "INV-2026-0134", customerId: "cus_011", customerName: "Godrej Properties", issueDate: "2026-03-20", dueDate: "2026-05-19", totalAmount: 192500, balanceDue: 192500, taxAmount: 29365, status: "viewed", currency: "INR", reference: "PO-GODREJ-118", lineCount: 2, hasEinvoice: true, irn: "9b3c…7e21" },
  { id: "inv_010", invoiceNumber: "INV-2026-0133", customerId: "cus_006", customerName: "Mahindra Logistics", issueDate: "2026-03-12", dueDate: "2026-04-26", totalAmount: 156800, balanceDue: 0, taxAmount: 23919, status: "paid", currency: "INR", reference: "PO-MAH-2241", lineCount: 3, hasEinvoice: true, irn: "1c5e…a3d7" },
  { id: "inv_011", invoiceNumber: "INV-2026-0132", customerId: "cus_001", customerName: "Tata Consultancy Services", issueDate: "2026-03-08", dueDate: "2026-04-22", totalAmount: 600000, balanceDue: 600000, taxAmount: 91525, status: "overdue", currency: "INR", reference: "PO-TCS-9912", lineCount: 5, hasEinvoice: true, irn: "6e8a…2c91" },
  { id: "inv_012", invoiceNumber: "INV-2026-0131", customerId: "cus_005", customerName: "Reliance Retail", issueDate: "2026-04-15", dueDate: "2026-07-14", totalAmount: 296000, balanceDue: 296000, taxAmount: 45152, status: "draft", currency: "INR", reference: "—", lineCount: 4, hasEinvoice: false, irn: null },
  { id: "inv_013", invoiceNumber: "INV-2026-0130", customerId: "cus_002", customerName: "Wipro Limited", issueDate: "2026-04-14", dueDate: "2026-05-14", totalAmount: 142800, balanceDue: 142800, taxAmount: 21783, status: "draft", currency: "INR", reference: "—", lineCount: 2, hasEinvoice: false, irn: null },
  { id: "inv_014", invoiceNumber: "INV-2026-0129", customerId: "cus_009", customerName: "Aditya Birla Fashion", issueDate: "2026-02-28", dueDate: "2026-05-14", totalAmount: 425000, balanceDue: 425000, taxAmount: 64831, status: "overdue", currency: "INR", reference: "PO-ABFRL-7644", lineCount: 6, hasEinvoice: true, irn: "8a4d…1f23" },
  { id: "inv_015", invoiceNumber: "INV-2026-0128", customerId: "cus_004", customerName: "Sharma Steel Industries", issueDate: "2026-03-05", dueDate: "2026-05-04", totalAmount: 280000, balanceDue: 0, taxAmount: 42712, status: "paid", currency: "INR", reference: "PO-SS-4419", lineCount: 4, hasEinvoice: true, irn: "5c7b…d402" },
  { id: "inv_016", invoiceNumber: "INV-2026-0127", customerId: "cus_001", customerName: "Tata Consultancy Services", issueDate: "2026-04-18", dueDate: "2026-06-02", totalAmount: 245000, balanceDue: 245000, taxAmount: 37373, status: "sent", currency: "INR", reference: "PO-TCS-9925", lineCount: 3, hasEinvoice: true, irn: "2d9f…8c11" },
];

// ─── Invoice Line Items (for detail view of inv_001) ──────────────────────────
const INVOICE_LINES_001 = [
  { id: 1, description: "Cloud infrastructure consulting — Q1 retainer", hsn: "998313", qty: 1, unit: "service", rate: 380000, taxRate: 18, amount: 380000, taxAmount: 68400 },
  { id: 2, description: "DevOps assessment & roadmap", hsn: "998313", qty: 80, unit: "hours", rate: 1500, taxRate: 18, amount: 120000, taxAmount: 21600 },
  { id: 3, description: "Security audit (penetration testing)", hsn: "998314", qty: 1, unit: "service", rate: 75000, taxRate: 18, amount: 75000, taxAmount: 13500 },
  { id: 4, description: "On-site workshop — 2-day developer training", hsn: "998313", qty: 2, unit: "days", rate: 18000, taxRate: 18, amount: 36000, taxAmount: 6480 },
  { id: 5, description: "Documentation deliverables", hsn: "998313", qty: 1, unit: "service", rate: 25000, taxRate: 18, amount: 25000, taxAmount: 4500 },
  { id: 6, description: "Travel reimbursement (domestic)", hsn: "998313", qty: 1, unit: "lot", rate: 26000, taxRate: 18, amount: 26000, taxAmount: 4680 },
];

// ─── Quotes / Sales Orders ────────────────────────────────────────────────────
const AR_QUOTES = [
  { id: "qt_001", quoteNumber: "QT-2026-0042", customerId: "cus_001", customerName: "Tata Consultancy Services", issueDate: "2026-04-22", validTill: "2026-05-22", totalAmount: 1240000, status: "sent", lineCount: 8 },
  { id: "qt_002", quoteNumber: "QT-2026-0041", customerId: "cus_005", customerName: "Reliance Retail", issueDate: "2026-04-20", validTill: "2026-05-20", totalAmount: 2840000, status: "viewed", lineCount: 14 },
  { id: "qt_003", quoteNumber: "QT-2026-0040", customerId: "cus_002", customerName: "Wipro Limited", issueDate: "2026-04-18", validTill: "2026-05-02", totalAmount: 384000, status: "accepted", lineCount: 4 },
  { id: "qt_004", quoteNumber: "QT-2026-0039", customerId: "cus_004", customerName: "Sharma Steel Industries", issueDate: "2026-04-12", validTill: "2026-05-12", totalAmount: 528000, status: "rejected", lineCount: 6 },
  { id: "qt_005", quoteNumber: "QT-2026-0038", customerId: "cus_009", customerName: "Aditya Birla Fashion", issueDate: "2026-04-10", validTill: "2026-05-10", totalAmount: 1180000, status: "expired", lineCount: 9 },
  { id: "qt_006", quoteNumber: "QT-2026-0037", customerId: "cus_007", customerName: "Bharti Airtel", issueDate: "2026-04-25", validTill: "2026-05-25", totalAmount: 645000, status: "draft", lineCount: 5 },
];

const AR_SALES_ORDERS = [
  { id: "so_001", soNumber: "SO-2026-0028", customerId: "cus_002", customerName: "Wipro Limited", issueDate: "2026-04-19", expectedDelivery: "2026-05-15", totalAmount: 384000, status: "open", fulfilment: "partial", lineCount: 4 },
  { id: "so_002", soNumber: "SO-2026-0027", customerId: "cus_005", customerName: "Reliance Retail", issueDate: "2026-04-17", expectedDelivery: "2026-05-30", totalAmount: 2120000, status: "open", fulfilment: "pending", lineCount: 12 },
  { id: "so_003", soNumber: "SO-2026-0026", customerId: "cus_001", customerName: "Tata Consultancy Services", issueDate: "2026-04-08", expectedDelivery: "2026-04-28", totalAmount: 684000, status: "fulfilled", fulfilment: "delivered", lineCount: 6 },
  { id: "so_004", soNumber: "SO-2026-0025", customerId: "cus_009", customerName: "Aditya Birla Fashion", issueDate: "2026-04-04", expectedDelivery: "2026-05-04", totalAmount: 1182000, status: "open", fulfilment: "partial", lineCount: 8 },
  { id: "so_005", soNumber: "SO-2026-0024", customerId: "cus_011", customerName: "Godrej Properties", issueDate: "2026-04-01", expectedDelivery: "2026-04-22", totalAmount: 192500, status: "fulfilled", fulfilment: "delivered", lineCount: 2 },
];

// ─── Credit Notes ─────────────────────────────────────────────────────────────
const AR_CREDIT_NOTES = [
  { id: "cn_001", creditNoteNumber: "CN-2026-0008", customerId: "cus_004", customerName: "Sharma Steel Industries", invoiceId: "inv_015", invoiceNumber: "INV-2026-0128", issueDate: "2026-04-08", amount: 18400, reason: "Damaged goods returned — partial refund", status: "issued" },
  { id: "cn_002", creditNoteNumber: "CN-2026-0007", customerId: "cus_001", customerName: "Tata Consultancy Services", invoiceId: "inv_008", invoiceNumber: "INV-2026-0135", issueDate: "2026-04-02", amount: 12500, reason: "Service hour adjustment per agreement", status: "adjusted" },
  { id: "cn_003", creditNoteNumber: "CN-2026-0006", customerId: "cus_005", customerName: "Reliance Retail", invoiceId: "inv_002", invoiceNumber: "INV-2026-0141", issueDate: "2026-03-28", amount: 84200, reason: "Volume discount applied retroactively", status: "issued" },
  { id: "cn_004", creditNoteNumber: "CN-2026-0005", customerId: "cus_006", customerName: "Mahindra Logistics", invoiceId: "inv_010", invoiceNumber: "INV-2026-0133", issueDate: "2026-03-15", amount: 6200, reason: "Tax recalculation correction", status: "adjusted" },
  { id: "cn_005", creditNoteNumber: "CN-2026-0004", customerId: "cus_009", customerName: "Aditya Birla Fashion", invoiceId: null, invoiceNumber: null, issueDate: "2026-03-10", amount: 24500, reason: "Goodwill credit — service issue Q4", status: "draft" },
  { id: "cn_006", creditNoteNumber: "CN-2026-0003", customerId: "cus_010", customerName: "Vedanta Resources", invoiceId: "inv_004", invoiceNumber: "INV-2026-0139", issueDate: "2026-03-04", amount: 42800, reason: "Order partially cancelled before dispatch", status: "cancelled" },
];

// ─── Receipts ─────────────────────────────────────────────────────────────────
const AR_RECEIPTS = [
  { id: "rcp_001", customerId: "cus_001", customerName: "Tata Consultancy Services", receiptDate: "2026-04-22", amount: 318900, paymentMethod: "bank_transfer", referenceNumber: "NEFT-AXIS-2204A", invoiceIds: ["inv_008"], notes: "Cleared INV-2026-0135 in full" },
  { id: "rcp_002", customerId: "cus_009", customerName: "Aditya Birla Fashion", receiptDate: "2026-04-19", amount: 400000, paymentMethod: "rtgs", referenceNumber: "RTGS-HDFC-1904", invoiceIds: ["inv_005"], notes: "Partial against INV-2026-0138" },
  { id: "rcp_003", customerId: "cus_006", customerName: "Mahindra Logistics", receiptDate: "2026-04-15", amount: 156800, paymentMethod: "bank_transfer", referenceNumber: "NEFT-ICICI-1504", invoiceIds: ["inv_010"], notes: "—" },
  { id: "rcp_004", customerId: "cus_004", customerName: "Sharma Steel Industries", receiptDate: "2026-04-12", amount: 280000, paymentMethod: "cheque", referenceNumber: "CHQ-994221", invoiceIds: ["inv_015"], notes: "Cheque cleared 2026-04-12" },
  { id: "rcp_005", customerId: "cus_008", customerName: "Amazon Pay India", receiptDate: "2026-04-10", amount: 84600, paymentMethod: "upi", referenceNumber: "UPI-AMZN-040910", invoiceIds: [], notes: "Settlement batch" },
  { id: "rcp_006", customerId: "cus_002", customerName: "Wipro Limited", receiptDate: "2026-04-04", amount: 142000, paymentMethod: "bank_transfer", referenceNumber: "NEFT-SBI-0404B", invoiceIds: [], notes: "Advance against next PO" },
  { id: "rcp_007", customerId: "cus_007", customerName: "Bharti Airtel", receiptDate: "2026-03-28", amount: 92500, paymentMethod: "rtgs", referenceNumber: "RTGS-HDFC-2803", invoiceIds: [], notes: "—" },
  { id: "rcp_008", customerId: "cus_011", customerName: "Godrej Properties", receiptDate: "2026-03-20", amount: 47000, paymentMethod: "cheque", referenceNumber: "CHQ-118832", invoiceIds: [], notes: "Partial advance" },
];

// ─── Collection Assignments ───────────────────────────────────────────────────
const AR_COLLECTIONS = [
  { id: "ca_001", invoiceId: "inv_003", invoiceNumber: "INV-2026-0140", customerName: "Sharma Steel Industries", balanceDue: 412800, assignedTo: "u_priya", assigneeName: "Priya Nair", assignedAt: "2026-04-22T09:14:00", status: "contacted", notes: "Spoke with Mukesh — promised payment by end of week.", followUpDate: "2026-04-29" },
  { id: "ca_002", invoiceId: "inv_004", invoiceNumber: "INV-2026-0139", customerName: "Vedanta Resources", balanceDue: 542000, assignedTo: "u_priya", assigneeName: "Priya Nair", assignedAt: "2026-04-22T09:18:00", status: "promised", notes: "AP confirmed payment in batch on 2026-05-02.", followUpDate: "2026-05-02" },
  { id: "ca_003", invoiceId: "inv_011", invoiceNumber: "INV-2026-0132", customerName: "Tata Consultancy Services", balanceDue: 600000, assignedTo: "u_arjun", assigneeName: "Arjun Bhatt", assignedAt: "2026-04-21T14:30:00", status: "open", notes: "PO mismatch needs resolution before payment.", followUpDate: "2026-04-26" },
  { id: "ca_004", invoiceId: "inv_014", invoiceNumber: "INV-2026-0129", customerName: "Aditya Birla Fashion", balanceDue: 425000, assignedTo: "u_arjun", assigneeName: "Arjun Bhatt", assignedAt: "2026-04-19T11:00:00", status: "escalated", notes: "Escalated to AP director — no response in 7 days.", followUpDate: "2026-04-25" },
  { id: "ca_005", invoiceId: "inv_001", invoiceNumber: "INV-2026-0142", customerName: "Tata Consultancy Services", balanceDue: 684000, assignedTo: "u_priya", assigneeName: "Priya Nair", assignedAt: "2026-04-23T10:00:00", status: "open", notes: null, followUpDate: "2026-04-30" },
];

// ─── Dunning ──────────────────────────────────────────────────────────────────
const AR_DUNNING_OVERDUE = [
  { id: "inv_003", invoiceNumber: "INV-2026-0140", customerId: "cus_004", customerName: "Sharma Steel Industries", customerEmail: "accounts@sharmasteel.in", dueDate: "2026-05-21", totalAmount: 412800, balanceDue: 412800, daysOverdue: 4 },
  { id: "inv_004", invoiceNumber: "INV-2026-0139", customerId: "cus_010", customerName: "Vedanta Resources", customerEmail: "ap.central@vedanta.co.in", dueDate: "2026-04-16", totalAmount: 542000, balanceDue: 542000, daysOverdue: 39 },
  { id: "inv_011", invoiceNumber: "INV-2026-0132", customerId: "cus_001", customerName: "Tata Consultancy Services", customerEmail: "ap@tcs.com", dueDate: "2026-04-22", totalAmount: 600000, balanceDue: 600000, daysOverdue: 33 },
  { id: "inv_014", invoiceNumber: "INV-2026-0129", customerId: "cus_009", customerName: "Aditya Birla Fashion", customerEmail: "ap@abfrl.adityabirla.com", dueDate: "2026-05-14", totalAmount: 425000, balanceDue: 425000, daysOverdue: 11 },
];

const AR_DUNNING_RULES = [
  { id: "dr_001", name: "Friendly reminder — 3 days after due", daysAfterDue: 3, channel: "email", action: "send_reminder", bodyTemplate: "Hi {{customer_name}}, just a quick reminder that invoice {{invoice_number}} for {{amount}} was due {{due_date}}. Could you confirm when we can expect payment?", isActive: true, escalationLevel: 1 },
  { id: "dr_002", name: "Firm follow-up — 14 days", daysAfterDue: 14, channel: "email", action: "send_reminder", bodyTemplate: "Dear {{customer_name}}, invoice {{invoice_number}} ({{amount}}) is now 14 days overdue. Kindly process payment at the earliest to avoid late fees.", isActive: true, escalationLevel: 2 },
  { id: "dr_003", name: "Escalation — 30 days", daysAfterDue: 30, channel: "email", action: "escalate_to_manager", bodyTemplate: "Final notice: invoice {{invoice_number}} is 30+ days overdue. Account placed on credit hold.", isActive: true, escalationLevel: 3 },
  { id: "dr_004", name: "WhatsApp nudge — 7 days", daysAfterDue: 7, channel: "whatsapp", action: "send_reminder", bodyTemplate: "Hi {{customer_name}}, invoice {{invoice_number}} for {{amount}} is overdue. Please clear at your earliest.", isActive: false, escalationLevel: 1 },
];

const AR_DUNNING_LOG = [
  { id: "dl_001", invoiceId: "inv_003", invoiceNumber: "INV-2026-0140", customerName: "Sharma Steel Industries", customerEmail: "accounts@sharmasteel.in", channel: "email", sentAt: "2026-05-24T09:14:00", status: "delivered" },
  { id: "dl_002", invoiceId: "inv_004", invoiceNumber: "INV-2026-0139", customerName: "Vedanta Resources", customerEmail: "ap.central@vedanta.co.in", channel: "email", sentAt: "2026-05-22T16:30:00", status: "delivered" },
  { id: "dl_003", invoiceId: "inv_011", invoiceNumber: "INV-2026-0132", customerName: "Tata Consultancy Services", customerEmail: "ap@tcs.com", channel: "email", sentAt: "2026-05-22T16:31:00", status: "sent" },
  { id: "dl_004", invoiceId: "inv_014", invoiceNumber: "INV-2026-0129", customerName: "Aditya Birla Fashion", customerEmail: "ap@abfrl.adityabirla.com", channel: "email", sentAt: "2026-05-15T11:02:00", status: "delivered" },
  { id: "dl_005", invoiceId: "inv_004", invoiceNumber: "INV-2026-0139", customerName: "Vedanta Resources", customerEmail: "ap.central@vedanta.co.in", channel: "whatsapp", sentAt: "2026-05-08T10:00:00", status: "failed" },
  { id: "dl_006", invoiceId: "inv_011", invoiceNumber: "INV-2026-0132", customerName: "Tata Consultancy Services", customerEmail: "ap@tcs.com", channel: "email", sentAt: "2026-05-01T09:00:00", status: "delivered" },
];

window.AR = {
  CUSTOMERS: AR_CUSTOMERS,
  INVOICES: AR_INVOICES,
  INVOICE_LINES_001,
  QUOTES: AR_QUOTES,
  SALES_ORDERS: AR_SALES_ORDERS,
  CREDIT_NOTES: AR_CREDIT_NOTES,
  RECEIPTS: AR_RECEIPTS,
  COLLECTIONS: AR_COLLECTIONS,
  DUNNING_OVERDUE: AR_DUNNING_OVERDUE,
  DUNNING_RULES: AR_DUNNING_RULES,
  DUNNING_LOG: AR_DUNNING_LOG,
};
