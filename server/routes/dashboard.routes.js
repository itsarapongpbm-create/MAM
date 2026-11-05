/**
 * Business Dashboard & Financial Metrics Routes
 * Endpoint: /api/dashboard
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงตัวชี้วัดแดชบอร์ด รายได้ ค่าใช้จ่าย กำไรสุทธิ ลูกหนี้ค้างรับ กราฟแนวโน้ม และแยกหมวดหมู่
router.get('/metrics', async (req, res) => {
    try {
        const period = req.query.period || 'this_month';
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const curYear = now.getFullYear();
        const curMonth = String(now.getMonth() + 1).padStart(2, '0');
        const curYm = `${curYear}-${curMonth}`;

        const prevDate = new Date(curYear, now.getMonth() - 1, 1);
        const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        const prev2Date = new Date(curYear, now.getMonth() - 2, 1);
        const prev2Ym = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, '0')}`;

        const monthsFullTh = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

        let docDateFilter = `strftime('%Y-%m', issue_date) = '${curYm}'`;
        let expDateFilter = `strftime('%Y-%m', transaction_date) = '${curYm}'`;
        let prevDocDateFilter = `strftime('%Y-%m', issue_date) = '${prevYm}'`;
        let prevExpDateFilter = `strftime('%Y-%m', transaction_date) = '${prevYm}'`;
        let periodLabel = `เดือนนี้ (${monthsFullTh[now.getMonth()]} ${curYear})`;

        if (period === 'last_month') {
            docDateFilter = `strftime('%Y-%m', issue_date) = '${prevYm}'`;
            expDateFilter = `strftime('%Y-%m', transaction_date) = '${prevYm}'`;
            prevDocDateFilter = `strftime('%Y-%m', issue_date) = '${prev2Ym}'`;
            prevExpDateFilter = `strftime('%Y-%m', transaction_date) = '${prev2Ym}'`;
            periodLabel = `เดือนที่แล้ว (${monthsFullTh[prevDate.getMonth()]} ${prevDate.getFullYear()})`;
        } else if (period === 'this_quarter') {
            const qIndex = Math.floor(now.getMonth() / 3);
            const qStartM = String(qIndex * 3 + 1).padStart(2, '0');
            const qEndM = String(qIndex * 3 + 3).padStart(2, '0');
            const prevQDate = new Date(curYear, (qIndex - 1) * 3, 1);
            const prevQYear = prevQDate.getFullYear();
            const prevQIdx = Math.floor(prevQDate.getMonth() / 3);
            const prevQStartM = String(prevQIdx * 3 + 1).padStart(2, '0');
            const prevQEndM = String(prevQIdx * 3 + 3).padStart(2, '0');

            docDateFilter = `strftime('%Y-%m', issue_date) >= '${curYear}-${qStartM}' AND strftime('%Y-%m', issue_date) <= '${curYear}-${qEndM}'`;
            expDateFilter = `strftime('%Y-%m', transaction_date) >= '${curYear}-${qStartM}' AND strftime('%Y-%m', transaction_date) <= '${curYear}-${qEndM}'`;
            prevDocDateFilter = `strftime('%Y-%m', issue_date) >= '${prevQYear}-${prevQStartM}' AND strftime('%Y-%m', issue_date) <= '${prevQYear}-${prevQEndM}'`;
            prevExpDateFilter = `strftime('%Y-%m', transaction_date) >= '${prevQYear}-${prevQStartM}' AND strftime('%Y-%m', transaction_date) <= '${prevQYear}-${prevQEndM}'`;
            periodLabel = `ไตรมาสที่ ${qIndex + 1} (Q${qIndex + 1}/${curYear})`;
        } else if (period === 'this_year') {
            docDateFilter = `strftime('%Y', issue_date) = '${curYear}'`;
            expDateFilter = `strftime('%Y', transaction_date) = '${curYear}'`;
            prevDocDateFilter = `strftime('%Y', issue_date) = '${curYear - 1}'`;
            prevExpDateFilter = `strftime('%Y', transaction_date) = '${curYear - 1}'`;
            periodLabel = `ทั้งปี ${curYear}`;
        }

        // เงื่อนไขกรองเฉพาะเอกสารขายที่รับรู้รายได้จริง (ไม่นับซ้ำกับ QUOTATION, BILLING_NOTE, PURCHASE_ORDER)
        const revenueDocFilter = `(
            (doc_type IN ('TAX_INVOICE', 'CASH_SALE') AND status IN ('ISSUED', 'PARTIAL_PAID', 'PAID', 'COMPLETED'))
            OR
            (doc_type = 'RECEIPT' AND status IN ('ISSUED', 'PARTIAL_PAID', 'PAID', 'COMPLETED') AND (ref_doc_number IS NULL OR (ref_doc_number NOT LIKE 'INV%' AND ref_doc_number NOT IN (SELECT doc_number FROM documents WHERE doc_type = 'TAX_INVOICE' AND doc_number IS NOT NULL))))
        )`;

        // 1. รายได้งวดปัจจุบัน (Current Period Revenue)
        const revRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE (${docDateFilter}) AND ${revenueDocFilter}
        `);

        // รายได้งวดก่อนหน้า (Previous Period Revenue สำหรับเทียบ % เติบโต)
        const prevRevRow = await db.getAsync(`
            SELECT COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE (${prevDocDateFilter}) AND ${revenueDocFilter}
        `);

        const curRevenue = revRow ? revRow.total : 0;
        const prevRevenue = prevRevRow ? prevRevRow.total : 0;
        let revGrowth = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue * 100) : 0;

        // 2. ลูกหนี้การค้าค้างรับ (Uncollected Receivables - กรองเฉพาะ TAX_INVOICE ที่ค้างรับ และใช้ยอดคงค้างจริง)
        const recRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(COALESCE(NULLIF(balance_due, 0), grand_total)), 0) as total,
                SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) as overdue_count
            FROM documents 
            WHERE doc_type = 'TAX_INVOICE' AND status IN ('ISSUED', 'PARTIAL_PAID')
        `, [todayStr]);

        // 3. ค่าใช้จ่ายงวดปัจจุบัน (Current Period Expenses - ไม่รวมบิลร่าง DRAFT)
        const expRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE (${expDateFilter}) AND payment_status != 'DRAFT'
        `);

        // ค่าใช้จ่ายงวดก่อนหน้า
        const prevExpRow = await db.getAsync(`
            SELECT COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE (${prevExpDateFilter}) AND payment_status != 'DRAFT'
        `);

        const curExpenses = expRow ? expRow.total : 0;
        const prevExpenses = prevExpRow ? prevExpRow.total : 0;
        let expGrowth = prevExpenses > 0 ? ((curExpenses - prevExpenses) / prevExpenses * 100) : 0;

        // 4. เจ้าหนี้การค้าค้างจ่าย (Accounts Payable)
        const in7DaysDate = new Date(Date.now() + 7 * 86400000);
        const in7DaysStr = in7DaysDate.toISOString().split('T')[0];
        const payRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(net_total), 0) as total,
                SUM(CASE WHEN due_date IS NOT NULL AND due_date <= ? THEN 1 ELSE 0 END) as due_soon_count
            FROM expenses 
            WHERE payment_status = 'UNPAID'
        `, [in7DaysStr]);

        // 5. กำไรสุทธิและอัตรากำไร (Net Profit & Margin)
        const netProfit = curRevenue - curExpenses;
        const profitMargin = curRevenue > 0 ? (netProfit / curRevenue * 100) : 0;

        // 6. ข้อมูลแนวโน้มรายเดือนสำหรับชาร์ต (Monthly Trend Jan - Dec Current Year)
        const thaiMonthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const monthKeys = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
        const currentYearStr = String(new Date().getFullYear());

        const revMonthlyRows = await db.allAsync(`
            SELECT strftime('%m', issue_date) as m, COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE strftime('%Y', issue_date) = ? AND ${revenueDocFilter}
            GROUP BY m
        `, [currentYearStr]);

        const expMonthlyRows = await db.allAsync(`
            SELECT strftime('%m', transaction_date) as m, COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE strftime('%Y', transaction_date) = ? AND payment_status != 'DRAFT'
            GROUP BY m
        `, [currentYearStr]);

        const revMonthMap = {};
        const expMonthMap = {};
        (revMonthlyRows || []).forEach(r => { revMonthMap[r.m] = r.total; });
        (expMonthlyRows || []).forEach(r => { expMonthMap[r.m] = r.total; });

        const monthlyTrend = {
            labels: thaiMonthLabels,
            revenue: monthKeys.map(k => revMonthMap[k] || 0),
            expenses: monthKeys.map(k => expMonthMap[k] || 0)
        };

        // 7. สัดส่วนค่าใช้จ่ายตามหมวดหมู่ (Expense Categories)
        const catRows = await db.allAsync(`
            SELECT category, COALESCE(SUM(net_total), 0) as amount, COUNT(*) as count
            FROM expenses 
            WHERE (${expDateFilter}) AND payment_status != 'DRAFT'
            GROUP BY category
            ORDER BY amount DESC
        `);

        const totalCatAmount = (catRows || []).reduce((sum, c) => sum + c.amount, 0);
        const palette = ['#7D0A0A', '#991b1b', '#b91c1c', '#dc2626', '#d97706', '#f59e0b'];
        const expenseCategories = (catRows || []).map((c, idx) => ({
            category: c.category,
            amount: c.amount,
            count: c.count,
            percent: totalCatAmount > 0 ? Math.round((c.amount / totalCatAmount) * 100) : 0,
            color: palette[idx % palette.length]
        }));

        // 8. รายการลูกหนี้ค้างรับ 10 อันดับแรก (เฉพาะ TAX_INVOICE ที่ยังค้างรับ และแสดงยอดคงค้างจริง)
        const uncollectedDocs = await db.allAsync(`
            SELECT id, doc_type, doc_number, customer_name, issue_date, due_date, grand_total, balance_due,
                   COALESCE(NULLIF(balance_due, 0), grand_total) as outstanding_amount,
                   status, remarks
            FROM documents 
            WHERE doc_type = 'TAX_INVOICE' AND status IN ('ISSUED', 'PARTIAL_PAID')
            ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id DESC
            LIMIT 10
        `);

        const formattedReceivables = (uncollectedDocs || []).map(d => {
            let statusText = 'รอชำระ';
            let statusClass = 'status-pending';
            let isOverdue = false;
            let daysDiff = null;

            if (d.due_date) {
                const dueTime = new Date(d.due_date).getTime();
                const nowTime = new Date(todayStr).getTime();
                daysDiff = Math.round((dueTime - nowTime) / (1000 * 60 * 60 * 24));

                if (daysDiff < 0) {
                    isOverdue = true;
                    statusClass = 'status-overdue';
                    statusText = `เกินกำหนด ${Math.abs(daysDiff)} วัน`;
                } else if (daysDiff === 0) {
                    statusClass = 'status-warning';
                    statusText = 'ครบกำหนดวันนี้';
                } else {
                    statusClass = 'status-pending';
                    statusText = `รอชำระ (อีก ${daysDiff} วัน)`;
                }
            }

            let dueDisplay = '-';
            if (d.due_date) {
                const parts = d.due_date.split('-');
                if (parts.length === 3) {
                    const monthsTh = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                    dueDisplay = `${parseInt(parts[2], 10)} ${monthsTh[parseInt(parts[1], 10)]} ${parts[0]}`;
                }
            }

            return {
                id: d.id,
                doc_type: d.doc_type,
                doc_number: d.doc_number,
                customer_name: d.customer_name,
                due_date: d.due_date,
                due_date_display: dueDisplay,
                amount: d.outstanding_amount,
                status: d.status,
                status_text: statusText,
                status_class: statusClass,
                is_overdue: isOverdue,
                days_diff: daysDiff
            };
        });

        // 9. ข้อมูลบัญชีธนาคารและเงินสด (ดึงจากฐานข้อมูลจริงแบบ Real-time)
        let cashAndBankAccounts = [];
        let totalCash = 0;
        try {
            const dbAccounts = await db.allAsync(`
                SELECT 
                    id, 
                    bank_code as code, 
                    account_name as name, 
                    account_number as acc_no, 
                    current_balance as balance,
                    (SELECT COUNT(*) FROM bank_transactions WHERE account_id = bank_accounts.id AND is_reconciled = 0) as unreconciled_count
                FROM bank_accounts
                WHERE status = 'ACTIVE'
                ORDER BY is_default DESC, id ASC
            `);

            if (dbAccounts && dbAccounts.length > 0) {
                cashAndBankAccounts = dbAccounts.map(a => {
                    const unreconciled = a.unreconciled_count || 0;
                    return {
                        id: a.id,
                        code: a.code,
                        name: a.name,
                        acc_no: a.acc_no || '-',
                        balance: parseFloat(a.balance) || 0,
                        status: unreconciled > 0 ? `รอตรวจสอบ ${unreconciled} รายการ` : '✓ กระทบยอดแล้ว',
                        status_class: unreconciled > 0 ? 'text-warning' : 'text-success'
                    };
                });
                totalCash = cashAndBankAccounts.reduce((sum, a) => sum + a.balance, 0);
            }
        } catch (bErr) {
            console.warn('Could not query real bank accounts in dashboard:', bErr.message);
        }

        const cashAndBank = {
            accounts: cashAndBankAccounts,
            totalCash: parseFloat(totalCash.toFixed(2))
        };

        res.json({
            period,
            periodLabel,
            revenue: {
                total: curRevenue,
                growth: parseFloat(revGrowth.toFixed(1)),
                isPositive: revGrowth >= 0,
                count: revRow ? revRow.count : 0
            },
            receivable: {
                total: recRow ? recRow.total : 0,
                count: recRow ? recRow.count : 0,
                overdueCount: recRow ? recRow.overdue_count || 0 : 0
            },
            expenses: {
                total: curExpenses,
                growth: parseFloat(expGrowth.toFixed(1)),
                isPositive: expGrowth <= 0,
                count: expRow ? expRow.count : 0
            },
            payable: {
                total: payRow ? payRow.total : 0,
                count: payRow ? payRow.count : 0,
                dueSoonCount: payRow ? payRow.due_soon_count || 0 : 0,
                note: payRow && payRow.due_soon_count > 0 ? `ครบกำหนดใน 7 วัน` : 'ยอดค้างชำระปกติ'
            },
            profit: {
                total: netProfit,
                margin: parseFloat(profitMargin.toFixed(1)),
                isPositive: netProfit >= 0,
                health: profitMargin >= 40 ? 'สุขภาพการเงินยอดเยี่ยม' : (profitMargin >= 20 ? 'ผลการดำเนินงานดี' : 'ต้องเฝ้าระวัง')
            },
            monthlyTrend,
            expenseCategories,
            uncollectedInvoices: formattedReceivables,
            cashAndBank
        });
    } catch (err) {
        console.error('Error generating dashboard metrics:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
