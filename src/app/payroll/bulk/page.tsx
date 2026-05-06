"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toWords } from "number-to-words";
import Link from "next/link";

const safe = (v: any) => {
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
};
const fmt = (v: number) => safe(v).toFixed(2);
const commaFmt = (v: number) =>
  safe(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeWords = (v: number) => {
  const n = Math.round(safe(v));
  if (n <= 0) return "ZERO RUPEES ONLY";
  try { return toWords(n).toUpperCase() + " RUPEES ONLY"; }
  catch { return "ZERO RUPEES ONLY"; }
};

interface EmpRow {
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  grossSalary: number;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lopDays: number;
  tds: number;
  advanceDeduction: number;
  bankName: string;
  accountNo: string;
  ifsc: string;
  pan: string;
  uan: string;
}

const REQUIRED_COLS = [
  "employeeCode","employeeName","designation","department","grossSalary",
  "totalDays","presentDays","absentDays","halfDays","lopDays"
];

// PT slab auto-calculation (no manual input needed)
const calcPT = (grossSalary: number): number => {
  if (grossSalary < 15000) return 0;
  if (grossSalary <= 20000) return 150;
  return 200;
};

function calcPayroll(e: EmpRow, cfg: any) {
  const g    = safe(e.grossSalary);
  const tot  = safe(e.totalDays) || 1;
  const abs  = safe(e.absentDays);
  // LOP = absent days (Excel should have correct absent days already)
  const payable = Math.max(0, tot - abs);
  const factor  = payable / tot;

  const sBasic = g * safe(cfg.basicPct) / 100;
  const sHra   = sBasic * safe(cfg.hraPct) / 100;
  const sConv  = sBasic * safe(cfg.convPct) / 100;
  const sOther = sBasic * safe(cfg.otherPct) / 100;
  const sSpec  = Math.max(0, g - sBasic - sHra - sConv - sOther);

  // Earned = prorated (LOP already reflected, no separate LOP deduction)
  const eBasic = sBasic * factor;
  const eHra   = sHra   * factor;
  const eConv  = sConv  * factor;
  const eOther = sOther * factor;
  const eSpec  = sSpec  * factor;
  const grossEarned = eBasic + eHra + eConv + eOther + eSpec;

  // Deductions — PF = 12% of Basic Earned, max ₹1,800
  const pfDed   = Math.min(eBasic * safe(cfg.pfPct) / 100, 1800);
  const ptDed   = calcPT(g);  // auto slab
  const tdsDed  = safe(e.tds);
  const advDed  = safe(e.advanceDeduction);
  const totalDed = pfDed + ptDed + tdsDed + advDed;
  const net = grossEarned - totalDed;

  return {
    payable, grossEarned,
    pf: pfDed, pt: ptDed, tds: tdsDed, adv: advDed, totalDed, net,
    words: safeWords(net),
    std: { basic: sBasic, hra: sHra, conv: sConv, other: sOther, spec: sSpec },
    earn: { basic: eBasic, hra: eHra, conv: eConv, other: eOther, spec: eSpec },
  };
}

function PayslipCard({ emp, c, month }: { emp: EmpRow; c: ReturnType<typeof calcPayroll>; month: string }) {
  return (
    <div style={{ background: "#fff", color: "#000", fontFamily: "Arial, sans-serif", padding: "24px 30px", border: "1px solid #aaa", fontSize: 10 }}>
      {/* Header */}
      <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: "bold", margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>YNM Pan Global Trade Pvt Ltd</h1>
        <p style={{ fontSize: 9, margin: "2px 0 0", color: "#444" }}>YNM Safety | Level 4, Corporate Park, Mumbai, Maharashtra – 400001</p>
        <div style={{ marginTop: 8, border: "1px solid #000", display: "inline-block", padding: "3px 18px" }}>
          <span style={{ fontSize: 11, fontWeight: "bold" }}>SALARY SLIP – {month.toUpperCase()}</span>
        </div>
      </div>
      {/* Employee Details */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          {[
            [["Employee Name:", emp.employeeName], ["Code:", emp.employeeCode]],
            [["Designation:", emp.designation],   ["Department:", emp.department]],
            [["PAN:", emp.pan || "—"],             ["UAN:", emp.uan || "—"]],
            [["Bank:", emp.bankName || "—"],       ["A/C No:", emp.accountNo || "—"]],
            [["IFSC:", emp.ifsc || "—"],           ["", ""]],
          ].map((rowD, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              {rowD.map(([l, v], j) => (
                <React.Fragment key={j}>
                  <td style={{ padding: "3px 6px", fontWeight: "bold", color: "#333", width: "16%" }}>{l}</td>
                  <td style={{ padding: "3px 6px", width: "34%" }}>{v as string}</td>
                </React.Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Attendance */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000", marginBottom: 10 }}>
        <thead>
          <tr style={{ background: "#000", color: "#fff" }}>
            {["Total Days","Present","Absent","Half Days","LOP","Payable Days"].map(h => (
              <th key={h} style={{ padding: "5px", textAlign: "center" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ textAlign: "center" }}>
            {[emp.totalDays, emp.presentDays, emp.absentDays, emp.halfDays, emp.lopDays, c.payable].map((v, i) => (
              <td key={i} style={{ padding: "5px", border: "1px solid #aaa", fontWeight: i === 5 ? "bold" : "normal" }}>
                {i === 5 ? fmt(Number(v)) : String(v)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {/* Salary */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000", marginBottom: 10 }}>
        <thead>
          <tr style={{ background: "#000", color: "#fff" }}>
            <th style={{ padding: "5px 6px", textAlign: "left" }}>Earnings</th>
            <th style={{ padding: "5px 6px", textAlign: "right" }}>Monthly</th>
            <th style={{ padding: "5px 6px", textAlign: "right" }}>Earned</th>
            <th style={{ padding: "5px 6px", textAlign: "left" }}>Deductions</th>
            <th style={{ padding: "5px 6px", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {[
            { eLabel: "Basic Salary",         std: c.std.basic, earn: c.earn.basic, dLabel: "Provident Fund (PF)",  dVal: c.ded.pf },
            { eLabel: "House Rent Allowance", std: c.std.hra,   earn: c.earn.hra,   dLabel: "Professional Tax (PT)",dVal: c.ded.pt },
            { eLabel: "Conveyance Allowance", std: c.std.conv,  earn: c.earn.conv,  dLabel: "ESI",                  dVal: c.ded.esi },
            { eLabel: "Other Allowance",      std: c.std.other, earn: c.earn.other, dLabel: "TDS",                  dVal: c.ded.tds },
            { eLabel: "Special Allowance",    std: c.std.spec,  earn: c.earn.spec,  dLabel: "Loss of Pay (LOP)",    dVal: c.ded.lop },
            { eLabel: "Bonus",                std: 0,           earn: c.earn.bonus, dLabel: "Loan Deduction",       dVal: c.ded.loanDed },
            { eLabel: "Incentive",            std: 0,           earn: c.earn.inc,   dLabel: "Advance Deduction",    dVal: c.ded.advDed },
          ].map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "4px 6px" }}>{r.eLabel}</td>
              <td style={{ padding: "4px 6px", textAlign: "right" }}>{commaFmt(r.std)}</td>
              <td style={{ padding: "4px 6px", textAlign: "right" }}>{commaFmt(r.earn)}</td>
              <td style={{ padding: "4px 6px" }}>{r.dLabel}</td>
              <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.dVal > 0 ? commaFmt(r.dVal) : ""}</td>
            </tr>
          ))}
          <tr style={{ background: "#e0e0e0", fontWeight: "bold", borderTop: "2px solid #000" }}>
            <td style={{ padding: "5px 6px" }}>Total Earnings</td>
            <td style={{ padding: "5px 6px", textAlign: "right" }}>{commaFmt(safe(emp.grossSalary))}</td>
            <td style={{ padding: "5px 6px", textAlign: "right" }}>{commaFmt(c.grossEarned)}</td>
            <td style={{ padding: "5px 6px" }}>Total Deductions</td>
            <td style={{ padding: "5px 6px", textAlign: "right" }}>{commaFmt(c.totalDed)}</td>
          </tr>
        </tbody>
      </table>
      {/* Net */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "2px solid #000" }}>
        <tbody>
          <tr>
            <td style={{ padding: "8px 12px", fontWeight: "bold", borderRight: "1px solid #000", width: "45%" }}>
              Net Salary: <span style={{ fontSize: 14 }}>₹ {commaFmt(c.net)}</span>
            </td>
            <td style={{ padding: "8px 12px" }}>
              <strong>In Words:</strong> <em>{c.words}</em>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 8, textAlign: "center", color: "#999", marginTop: 8 }}>
        System-generated payslip. No physical signature required.
      </p>
    </div>
  );
}

const DEFAULT_CFG = { basicPct: 50, hraPct: 50, convPct: 20, otherPct: 30, pfPct: 12 };

export default function BulkPayrollPage() {
  const [month,    setMonth]    = useState("May 2026");
  const [cfg,      setCfg]      = useState(DEFAULT_CFG);
  const [employees,setEmployees]= useState<EmpRow[]>([]);
  const [errors,   setErrors]   = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);
  const slipRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors([]); setEmployees([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: 0 });
        if (!raw.length) { setErrors(["Excel is empty."]); return; }
        // Normalise headers
        const normalised: EmpRow[] = raw.map((r: any) => {
          const lower: any = {};
          for (const k of Object.keys(r)) lower[k.trim().replace(/\s+/g,"").toLowerCase()] = r[k];
          return {
            employeeCode:     String(lower.employeecode || lower.code || ""),
            employeeName:     String(lower.employeename || lower.name || ""),
            designation:      String(lower.designation || ""),
            department:       String(lower.department || ""),
            grossSalary:      safe(lower.grosssalary || lower.gross || 0),
            totalDays:        safe(lower.totaldays || lower.total || 31),
            presentDays:      safe(lower.presentdays || lower.present || 0),
            absentDays:       safe(lower.absentdays || lower.absent || 0),
            halfDays:         safe(lower.halfdays || lower.half || 0),
            lopDays:          safe(lower.lopdays || lower.lop || 0),
            tds:              safe(lower.tds || 0),
            advanceDeduction: safe(lower.advancededuction || lower.advance || 0),
            bankName:         String(lower.bankname || lower.bank || ""),
            accountNo:        String(lower.accountno || lower.account || ""),
            ifsc:             String(lower.ifsc || ""),
            pan:              String(lower.pan || ""),
            uan:              String(lower.uan || ""),
          } as EmpRow;
        });
        const errs: string[] = [];
        normalised.forEach((emp, i) => {
          if (!emp.employeeCode) errs.push(`Row ${i+2}: Missing Employee Code`);
          if (!emp.employeeName) errs.push(`Row ${i+2}: Missing Employee Name`);
          if (!emp.grossSalary)  errs.push(`Row ${i+2}: Gross Salary is 0`);
        });
        setErrors(errs);
        if (!errs.length) setEmployees(normalised);
      } catch (err) {
        setErrors(["Failed to parse Excel. Please check the format."]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadAll = async () => {
    setLoading(true);
    for (let i = 0; i < employees.length; i++) {
      const el = slipRefs.current[i];
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#fff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      pdf.save(`Payslip_${employees[i].employeeCode}_${month.replace(" ", "_")}.pdf`);
    }
    setLoading(false);
  };

  const downloadTemplate = () => {
    const headers = [
      // Employee Info
      "Employee Code", "Employee Name", "Designation", "Department",
      // Salary
      "Gross Salary",
      "Basic Salary (Gross/Rate)", "HRA (Gross/Rate)", "Conveyance (Gross/Rate)", "Other Allowance (Gross/Rate)",
      "Basic Salary (Earned)",    "HRA (Earned)",      "Conveyance (Earned)",     "Other Allowance (Earned)",
      // Attendance
      "Total Days", "Present Days", "Absent Days", "Half Days", "LOP Days", "Payable Days",
      // Deductions
      "PF", "PT", "TDS", "Advance Deduction", "Total Deductions",
      // Net
      "Net Salary",
      // Bank
      "Bank Name", "Account No", "IFSC Code", "PAN", "UAN",
    ];

    // Sample row — computed values for YNM-001 (60000 gross, 29/31 days)
    const g1 = 60000, tot1 = 31, pay1 = 29, factor1 = pay1 / tot1;
    const sB1 = g1*0.5, sH1 = sB1*0.5, sC1 = sB1*0.2, sO1 = sB1*0.3;
    const eB1 = Math.round(sB1*factor1), eH1 = Math.round(sH1*factor1),
          eC1 = Math.round(sC1*factor1), eO1 = Math.round(sO1*factor1);
    const pf1 = Math.min(Math.round(eB1*0.12), 1800);
    const pt1 = g1 > 20000 ? 200 : g1 >= 15000 ? 150 : 0;
    const net1 = eB1 + eH1 + eC1 + eO1 - pf1 - pt1;
    const sample1 = [
      "YNM-001", "John Doe", "Safety Officer", "Safety",
      g1, sB1, sH1, sC1, sO1, eB1, eH1, eC1, eO1,
      tot1, pay1, 2, 0, 0, pay1,
      pf1, pt1, 0, 0, pf1 + pt1,
      net1,
      "HDFC Bank", "5010023456789", "HDFC0001234", "ABCDE1234F", "100234567890",
    ];

    const g2 = 45000, tot2 = 31, pay2 = 31, factor2 = 1;
    const sB2 = g2*0.5, sH2 = sB2*0.5, sC2 = sB2*0.2, sO2 = sB2*0.3;
    const eB2 = Math.round(sB2*factor2), eH2 = Math.round(sH2*factor2),
          eC2 = Math.round(sC2*factor2), eO2 = Math.round(sO2*factor2);
    const pf2 = Math.min(Math.round(eB2*0.12), 1800);
    const pt2 = g2 > 20000 ? 200 : g2 >= 15000 ? 150 : 0;
    const net2 = eB2 + eH2 + eC2 + eO2 - pf2 - pt2;
    const sample2 = [
      "YNM-002", "Priya Sharma", "HR Manager", "HR",
      g2, sB2, sH2, sC2, sO2, eB2, eH2, eC2, eO2,
      tot2, pay2, 0, 0, 0, pay2,
      pf2, pt2, 0, 0, pf2 + pt2,
      net2,
      "SBI", "1234567890", "SBIN0001234", "XYZAB5678G", "100234567891",
    ];

    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);

    // Auto column widths
    ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));

    // Freeze top row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    const border = {
      top:    { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left:   { style: "thin", color: { rgb: "000000" } },
      right:  { style: "thin", color: { rgb: "000000" } },
    };

    // Style header row — bold, grey fill, bordered
    headers.forEach((h, colIdx) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (!ws[addr]) ws[addr] = { v: h, t: "s" };
      ws[addr].s = {
        font:      { bold: true, sz: 10 },
        fill:      { fgColor: { rgb: "D9D9D9" } },
        border,
        alignment: { horizontal: "center", wrapText: true },
      };
    });

    // Style data rows — bordered cells, numbers right-aligned
    [sample1, sample2].forEach((row, rowIdx) => {
      row.forEach((val, colIdx) => {
        const addr = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s = {
          border,
          alignment: { horizontal: typeof val === "number" ? "right" : "left" },
        };
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, "Payroll Data");
    XLSX.writeFile(wb, "YNM_Payroll_Template.xlsx", { cellStyles: true });
  };

  const results = employees.map(emp => ({ emp, c: calcPayroll(emp, cfg) }));
  const totalNet = results.reduce((s, r) => s + r.c.net, 0);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bulk Payroll – Excel Upload</h1>
          <p className="text-sm text-gray-500">Upload employee attendance & salary data to generate all payslips at once.</p>
        </div>
        <Link href="/payroll">
          <Button variant="outline" className="border-gray-800 text-gray-800 hover:bg-gray-200">← Single Payslip</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8">
        {/* Config */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Month & Formula Config</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Payroll Month</Label>
                <Input className="h-8 text-xs" value={month} onChange={e => setMonth(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(cfg) as [keyof typeof DEFAULT_CFG, number][]).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{k.replace(/([A-Z])/g," $1").replace(/Pct/,"%").trim()}</Label>
                    <Input type="number" className="h-8 text-xs" value={v}
                      onChange={e => setCfg(prev => ({ ...prev, [k]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-700">
                <p className="font-semibold">PT Auto-Calculated per Salary Slab:</p>
                <p>Under ₹15,000 → ₹0 &nbsp;|&nbsp; ₹15k–₹20k → ₹150 &nbsp;|&nbsp; Above ₹20k → ₹200</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Upload Excel File</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-500">Download the template, fill in employee data, and upload. Required: Employee Code, Employee Name, Gross Salary. Salary components, PF, PT are auto-calculated.</p>
              <Button variant="outline" className="w-full text-xs h-8" onClick={downloadTemplate}>
                ⬇ Download Template Excel
              </Button>
              <Input type="file" accept=".xlsx,.xls,.csv" className="text-xs" onChange={handleExcel} />
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-300 rounded p-3 text-xs text-red-700 space-y-1">
                  {errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                </div>
              )}
            </CardContent>
          </Card>

          {employees.length > 0 && (
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Employees Loaded</span><span className="font-bold">{employees.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Total Net Payroll</span><span className="font-bold">₹ {commaFmt(totalNet)}</span></div>
                <Button onClick={downloadAll} disabled={loading} className="w-full mt-2 bg-white text-gray-900 hover:bg-gray-200 font-bold">
                  {loading ? "Generating PDFs..." : `⬇ Download All ${employees.length} Payslips (PDF)`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Preview Table */}
        <div className="xl:col-span-8">
          {employees.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Payroll Register — {month} ({employees.length} employees)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      {[
                        "Code","Name","Dept",
                        "Gross",
                        "Basic (G)","HRA (G)","Conv (G)","Other (G)",
                        "Basic (E)","HRA (E)","Conv (E)","Other (E)",
                        "Payable Days",
                        "PF","PT","TDS","Adv Ded","Total Ded",
                        "Net Salary"
                      ].map(h => (
                        <th key={h} className="p-2 text-right first:text-left whitespace-nowrap border-r border-gray-600 last:border-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(({ emp, c }, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="p-2 font-mono border-r border-gray-200">{emp.employeeCode}</td>
                        <td className="p-2 whitespace-nowrap border-r border-gray-200">{emp.employeeName}</td>
                        <td className="p-2 border-r border-gray-200">{emp.department}</td>
                        <td className="p-2 text-right border-r border-gray-200 font-medium">{Math.round(emp.grossSalary).toLocaleString("en-IN")}</td>
                        {/* Gross/Rate components */}
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.std.basic).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.std.hra).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.std.conv).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-300">{Math.round(c.std.other).toLocaleString("en-IN")}</td>
                        {/* Earned components */}
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.earn.basic).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.earn.hra).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.earn.conv).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-300">{Math.round(c.earn.other).toLocaleString("en-IN")}</td>
                        {/* Days & Deductions */}
                        <td className="p-2 text-right border-r border-gray-200">{fmt(c.payable)}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.pf).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right border-r border-gray-200">{c.pt}</td>
                        <td className="p-2 text-right border-r border-gray-200">{c.tds > 0 ? Math.round(c.tds).toLocaleString("en-IN") : "—"}</td>
                        <td className="p-2 text-right border-r border-gray-200">{c.adv > 0 ? Math.round(c.adv).toLocaleString("en-IN") : "—"}</td>
                        <td className="p-2 text-right border-r border-gray-200">{Math.round(c.totalDed).toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right font-bold">{Math.round(c.net).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-800 text-white font-bold">
                      <td className="p-2" colSpan={19}>TOTAL PAYROLL</td>
                      <td className="p-2 text-right">₹ {Math.round(totalNet).toLocaleString("en-IN")}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg border border-dashed border-gray-300 text-gray-400">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-base font-medium">Upload an Excel file to see all payrolls here</p>
              <p className="text-xs mt-1">Download the template, fill in employee data, and upload</p>
            </div>
          )}
        </div>
      </div>

      {/* Hidden Payslips for PDF rendering */}
      <div style={{ position: "absolute", left: -9999, top: 0 }}>
        {results.map(({ emp, c }, i) => (
          <div key={i} ref={el => { slipRefs.current[i] = el; }} style={{ width: 794 }}>
            <PayslipCard emp={emp} c={c} month={month} />
          </div>
        ))}
      </div>
    </div>
  );
}
