"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toWords } from "number-to-words";
import Link from "next/link";

const safe = (v: any): number => { const n = Number(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
const commaFmt = (v: number) => safe(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeWords = (v: number) => {
  const n = Math.round(safe(v));
  if (n <= 0) return "Zero Rupees Only";
  try { return toWords(n).replace(/\b\w/g, (c: string) => c.toUpperCase()) + " Rupees Only"; }
  catch { return "Zero Rupees Only"; }
};

export default function PayrollPage() {
  const slipRef = useRef<HTMLDivElement>(null);

  // Employee Info
  const [empName,       setEmpName]       = useState("Rajesh Kumar");
  const [empCode,       setEmpCode]       = useState("YNM-001");
  const [designation,   setDesignation]   = useState("Safety Officer");
  const [department,    setDepartment]    = useState("Safety & Compliance");
  const [location,      setLocation]      = useState("Mumbai");
  const [doj,           setDoj]           = useState("01-04-2023");
  const [pan,           setPan]           = useState("ABCDE1234F");
  const [uan,           setUan]           = useState("100234567890");
  const [bank,          setBank]          = useState("HDFC Bank");
  const [accNo,         setAccNo]         = useState("5010023456789");
  const [ifsc,          setIfsc]          = useState("HDFC0001234");
  const [month,         setMonth]         = useState("May 2026");
  const [grossSalary,   setGrossSalary]   = useState<number|string>(60000);

  // Attendance
  const [isProbation,   setIsProbation]   = useState(false);
  const [noPF,          setNoPF]          = useState(false); // Labour / contract workers
  const [paidLeaveAllowed]                = useState(2); // always 2 for non-probation
  const [totalDays,     setTotalDays]     = useState<number|string>(31);
  const [presentDays,   setPresentDays]   = useState<number|string>(28);
  const [halfDays,      setHalfDays]      = useState<number|string>(0);
  const [absentDays,    setAbsentDays]    = useState<number|string>(3);

  // Deductions config
  const [basicPct,    setBasicPct]    = useState<number|string>(50);
  const [hraPct,      setHraPct]      = useState<number|string>(50);
  const [convPct,     setConvPct]     = useState<number|string>(20);
  const [otherPct,    setOtherPct]    = useState<number|string>(30);
  // PF is fixed at 12% (statutory), max ₹1,800 — not configurable
  const PF_PCT = 12;

  // PT auto-calculated from gross salary slab (Maharashtra schedule)
  const calcPT = (g: number): number => {
    if (g < 15000) return 0;
    if (g <= 20000) return 150;
    return 200;
  };
  const [tds,         setTds]         = useState<number|string>(0);
  const [advDed,      setAdvDed]      = useState<number|string>(0);

  // Auto sync absent
  useEffect(() => {
    const t = safe(totalDays);
    const p = safe(presentDays);
    const h = safe(halfDays);
    const abs = Math.max(0, t - p - h * 0.5);
    setAbsentDays(Math.round(abs * 100) / 100);
  }, [presentDays, halfDays, totalDays]);

  // ─── PAYROLL CALCULATION ───────────────────────────────────────────
  // KEY RULES (matching user's reference payslip):
  //  1. LOP is NOT a deduction — it's already reflected in lower Earned values
  //  2. Earned = Gross × (payableDays / totalDays)  → automatically lower for LOP days
  //  3. PF = 12% of min(earnedBasic, ₹15,000)  — statutory PF wage ceiling
  //  4. Net = Gross Earned − (PF + PT + ESI + TDS + Advance)
  const C = (() => {
    const g   = safe(grossSalary);
    const tot = safe(totalDays) || 1;
    const abs = safe(absentDays);

    // Paid leave / LOP logic
    const lopDays       = isProbation ? abs : Math.max(0, abs - paidLeaveAllowed);
    const paidLeaveUsed = Math.min(abs, isProbation ? 0 : paidLeaveAllowed);
    const payableDays   = tot - lopDays;
    const factor        = Math.max(0, payableDays) / tot;

    // Monthly (Gross/Rate) components
    const sBasic = g * safe(basicPct) / 100;
    const sHra   = sBasic * safe(hraPct) / 100;
    const sConv  = sBasic * safe(convPct) / 100;
    const sOther = sBasic * safe(otherPct) / 100;
    const sSpec  = Math.max(0, g - sBasic - sHra - sConv - sOther);

    // Earned components (prorated — LOP already reflected here)
    const eBasic = sBasic * factor;
    const eHra   = sHra   * factor;
    const eConv  = sConv  * factor;
    const eOther = sOther * factor;
    const eSpec  = sSpec  * factor;
    const grossEarned = eBasic + eHra + eConv + eOther + eSpec;

    // Deductions — PF fixed at 12%, max ₹1,800; skipped if noPF is true (labour/contract)
    const pfDed   = noPF ? 0 : Math.min(eBasic * PF_PCT / 100, 1800);
    // PT slab: <15000 = ₹0 | 15000–20000 = ₹150 | >20000 = ₹200
    const ptDed   = calcPT(g);
    const tdsDed  = safe(tds);
    const advDedN = safe(advDed);
    const totalDed = pfDed + ptDed + tdsDed + advDedN;
    const net      = grossEarned - totalDed;

    return {
      payableDays, lopDays, paidLeaveUsed,
      std:  { basic: sBasic, hra: sHra, conv: sConv, other: sOther, spec: sSpec },
      earn: { basic: eBasic, hra: eHra, conv: eConv, other: eOther, spec: eSpec, gross: grossEarned },
      ded:  { pf: pfDed, pt: ptDed, tds: tdsDed, adv: advDedN, total: totalDed },
      net, words: safeWords(net),
    };
  })();

  const downloadPDF = async () => {
    const el = slipRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, w, Math.min(h, pdf.internal.pageSize.getHeight()));
    pdf.save(`Payslip_${empCode}_${month.replace(" ", "_")}.pdf`);
  };

  // Deduction rows — LOP removed (absorbed in earned), conditional on value > 0
  const dedRows: { label: string; val: number }[] = [
    { label: "Provident Fund (PF)",   val: C.ded.pf },
    { label: "Professional Tax (PT)", val: C.ded.pt },
    ...(C.ded.tds  > 0 ? [{ label: "TDS / Income Tax",     val: C.ded.tds  }] : []),
    ...(C.ded.adv  > 0 ? [{ label: "Advance Deduction",    val: C.ded.adv  }] : []),
  ];

  // Earning rows — hide Special Allowance if 0
  const earningRows = [
    { label: "Basic Salary",         std: C.std.basic, earned: C.earn.basic },
    { label: "House Rent Allowance", std: C.std.hra,   earned: C.earn.hra   },
    { label: "Conveyance",           std: C.std.conv,  earned: C.earn.conv  },
    { label: "Other Allowance",      std: C.std.other, earned: C.earn.other },
    ...(C.std.spec > 0 ? [{ label: "Special Allowance", std: C.std.spec, earned: C.earn.spec }] : []),
  ];

  // Pad arrays to equal length for table rows
  const maxRows = Math.max(earningRows.length, dedRows.length);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payroll Engine</h1>
          <p className="text-sm text-slate-500">YNM Pan Global Trade Pvt Ltd / YNM Safety</p>
        </div>
        <Link href="/payroll/bulk">
          <Button className="bg-slate-700 text-white hover:bg-slate-800">📊 Bulk Payroll</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* ── LEFT CONTROLS ── */}
        <div className="xl:col-span-4 space-y-4">

          {/* Employee */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700">Employee Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 grid grid-cols-2 gap-3">
              {([
                ["Employee Name",   empName,    setEmpName],
                ["Employee Code",   empCode,    setEmpCode],
                ["Designation",     designation,setDesignation],
                ["Department",      department, setDepartment],
                ["Location",        location,   setLocation],
                ["Date of Joining", doj,        setDoj],
                ["PAN Number",      pan,        setPan],
                ["UAN Number",      uan,        setUan],
                ["Bank Name",       bank,       setBank],
                ["Account No",      accNo,      setAccNo],
                ["IFSC Code",       ifsc,       setIfsc],
                ["Month",           month,      setMonth],
              ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                <div key={lbl} className="space-y-1">
                  <Label className="text-xs text-slate-600">{lbl}</Label>
                  <Input className="h-8 text-xs" value={val} onChange={e => set(e.target.value)} />
                </div>
              ))}
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-slate-600">Gross Monthly Salary (₹)</Label>
                <Input type="number" className="h-8 text-sm font-semibold" value={grossSalary}
                  onChange={e => setGrossSalary(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Attendance */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700">Attendance</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              {/* Probation Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-md p-3">
                <input type="checkbox" id="probation" checked={isProbation}
                  onChange={e => setIsProbation(e.target.checked)}
                  className="w-4 h-4 accent-amber-600 cursor-pointer" />
                <label htmlFor="probation" className="text-sm font-medium text-amber-800 cursor-pointer">
                  Employee is in Probation Period
                </label>
              </div>
              {/* No PF Toggle */}
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-md p-3">
                <input type="checkbox" id="noPF" checked={noPF}
                  onChange={e => setNoPF(e.target.checked)}
                  className="w-4 h-4 accent-red-600 cursor-pointer" />
                <label htmlFor="noPF" className="text-sm font-medium text-red-800 cursor-pointer">
                  No PF Deduction &nbsp;<span className="font-normal text-red-500">(Labour / Contract / Opt-out)</span>
                </label>
              </div>
              <p className="text-xs text-slate-500 -mt-1">
                {isProbation
                  ? "⚠ Probation: All absent days = LOP deduction (no free leaves)"
                  : "✅ Regular: First 2 absent days = Paid Leave (no deduction), rest = LOP"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["Total Days in Month", totalDays,   setTotalDays  ],
                  ["Present Days",        presentDays, setPresentDays],
                  ["Half Days",           halfDays,    setHalfDays   ],
                ] as [string, number|string, (v: string) => void][]).map(([lbl, val, set]) => (
                  <div key={lbl} className="space-y-1">
                    <Label className="text-xs text-slate-600">{lbl}</Label>
                    <Input type="number" className="h-8 text-xs" value={val} onChange={e => set(e.target.value)} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Absent Days (auto)</Label>
                  <Input type="number" className="h-8 text-xs bg-slate-50" value={absentDays} readOnly />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-slate-100 rounded p-2 text-center">
                  <p className="text-xs text-slate-500">Paid Leaves</p>
                  <p className="text-base font-bold text-green-700">{C.paidLeaveUsed}</p>
                </div>
                <div className="bg-slate-100 rounded p-2 text-center">
                  <p className="text-xs text-slate-500">LOP Days</p>
                  <p className="text-base font-bold text-red-600">{C.lopDays}</p>
                </div>
                <div className="bg-slate-800 text-white rounded p-2 text-center">
                  <p className="text-xs opacity-70">Payable Days</p>
                  <p className="text-base font-bold">{C.payableDays.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deduction Config */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700">Salary Formula & Deductions</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 grid grid-cols-2 gap-3">
              {([
                ["Basic % of Gross",  basicPct,  setBasicPct ],
                ["HRA % of Basic",    hraPct,    setHraPct   ],
                ["Conv % of Basic",   convPct,   setConvPct  ],
                ["Other % of Basic",  otherPct,  setOtherPct ],
                ["TDS / IT (₹)",      tds,       setTds      ],
                ["Advance Ded. (₹)",  advDed,    setAdvDed   ],
              ] as [string, number|string, (v: string) => void][]).map(([lbl, val, set]) => (
                <div key={lbl} className="space-y-1">
                  <Label className="text-xs text-slate-600">{lbl}</Label>
                  <Input type="number" className="h-8 text-xs" value={val} onChange={e => set(e.target.value)} />
                </div>
              ))}
              {/* PF fixed rule */}
              <div className="col-span-2 bg-slate-100 border border-slate-300 rounded p-3 text-xs text-slate-700 space-y-1">
                <p className="font-semibold">Provident Fund — Fixed Rule</p>
                <p>PF = 12% of Basic Earned &nbsp;|&nbsp; Maximum deduction: <strong>₹1,800 / month</strong></p>
                <p className={`font-bold ${noPF ? "text-red-600" : "text-slate-800"}`}>
                  {noPF ? "⛔ PF disabled (Labour / No-PF employee)" : `Applied this month: ₹${C.ded.pf.toFixed(0)}`}
                </p>
              </div>
              {/* PT auto-slab display */}
              <div className="col-span-2 bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-1">
                <p className="font-semibold">Professional Tax (Auto-calculated)</p>
                <p>Under ₹15,000 → ₹0 &nbsp;|&nbsp; ₹15,000–₹20,000 → ₹150 &nbsp;|&nbsp; Above ₹20,000 → ₹200</p>
                <p className="font-bold">Applied this month: ₹{C.ded.pt}</p>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border border-slate-200">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Gross Earned</span><span className="font-medium">₹ {commaFmt(C.earn.gross)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Total Deductions</span><span className="font-medium text-red-600">₹ {commaFmt(C.ded.total)}</span></div>
              <div className="flex justify-between text-base font-bold border-t pt-2 border-slate-200">
                <span>Net Salary</span>
                <span className="text-slate-800">₹ {commaFmt(C.net)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: PAYSLIP ── */}
        <div className="xl:col-span-8 flex flex-col">
          <h2 className="text-base font-semibold text-slate-700 mb-3">Payslip Preview</h2>

          {/* ── PAYSLIP ── */}
          <div ref={slipRef}
            style={{
              background: "#ffffff",
              color: "#1a1a1a",
              fontFamily: "'Arial', 'Helvetica', sans-serif",
              padding: "40px 44px",
              border: "1px solid #cccccc",
              width: "100%",
              boxSizing: "border-box",
            }}>

            {/* ── COMPANY HEADER ── */}
            <div style={{ textAlign: "center", borderBottom: "3px double #333", paddingBottom: "18px", marginBottom: "20px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: "bold", letterSpacing: "2px", margin: 0, textTransform: "uppercase" }}>
                YNM Pan Global Trade Pvt Ltd
              </h1>
              <p style={{ fontSize: "12px", color: "#555", margin: "5px 0 0" }}>
                YNM Safety | Corporate Park, Level 4, Andheri East, Mumbai – 400069 | CIN: U74999MH2020PTC123456
              </p>
              <div style={{ display: "inline-block", marginTop: "14px", border: "1.5px solid #333", padding: "5px 30px", borderRadius: "2px" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", letterSpacing: "1px" }}>
                  SALARY SLIP — {month.toUpperCase()}
                </span>
              </div>
            </div>

            {/* ── EMPLOYEE DETAILS (2-col grid) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", marginBottom: "20px", border: "1px solid #ccc" }}>
              {[
                ["Employee Name",  empName],   ["Employee Code",  empCode],
                ["Designation",    designation],["Department",     department],
                ["Location",       location],  ["Date of Joining",doj],
                ["Bank Name",      bank],       ["Account No",     accNo],
                ["IFSC Code",      ifsc],       ["PAN Number",     pan],
                ["UAN / EPF No",   uan],        ["",               ""],
              ].map(([lbl, val], i) => (
                <div key={i} style={{
                  display: "flex",
                  borderBottom: i < 10 ? "1px solid #ddd" : "none",
                  borderRight: i % 2 === 0 ? "1px solid #ccc" : "none",
                }}>
                  <div style={{ width: "42%", padding: "7px 10px", fontSize: "11px", fontWeight: "bold", color: "#444", background: "#f7f7f7", borderRight: "1px solid #ddd" }}>{lbl}</div>
                  <div style={{ width: "58%", padding: "7px 10px", fontSize: "11px" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* ── ATTENDANCE ── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", border: "1px solid #ccc" }}>
              <thead>
                <tr style={{ background: "#2c2c2c", color: "#fff" }}>
                  {["Total Days","Present Days","Absent Days","Half Days","Paid Leaves","LOP Days","Payable Days"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: "#fafafa", textAlign: "center" }}>
                  {[
                    String(totalDays),
                    String(presentDays),
                    String(safe(absentDays)),
                    String(halfDays),
                    String(C.paidLeaveUsed),
                    String(C.lopDays),
                    C.payableDays.toFixed(1),
                  ].map((v, i) => (
                    <td key={i} style={{
                      padding: "8px 6px", fontSize: "12px",
                      fontWeight: i === 6 ? "bold" : "normal",
                      borderRight: i < 6 ? "1px solid #ddd" : "none",
                    }}>{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* ── SALARY TABLE ── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", border: "1px solid #ccc" }}>
              <thead>
                <tr style={{ background: "#e8e8e8", color: "#1a1a1a", borderBottom: "2px solid #999" }}>
                  <th style={{ padding: "9px 10px", fontSize: "12px", textAlign: "left", width: "28%", borderRight: "1px solid #ccc" }}>Salary Components</th>
                  <th style={{ padding: "9px 10px", fontSize: "12px", textAlign: "right", width: "14%", borderRight: "1px solid #ccc" }}>Gross/Rate</th>
                  <th style={{ padding: "9px 10px", fontSize: "12px", textAlign: "right", width: "14%", borderRight: "2px solid #999" }}>Earned</th>
                  <th style={{ padding: "9px 10px", fontSize: "12px", textAlign: "left", width: "30%", borderRight: "1px solid #ccc" }}>Deductions</th>
                  <th style={{ padding: "9px 10px", fontSize: "12px", textAlign: "right", width: "14%" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }).map((_, i) => {
                  const er = earningRows[i];
                  const dr = dedRows[i];
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                      <td style={{ padding: "8px 10px", fontSize: "12px", borderRight: "1px solid #ddd" }}>{er?.label || ""}</td>
                      <td style={{ padding: "8px 10px", fontSize: "12px", textAlign: "right", borderRight: "1px solid #ddd" }}>
                        {er ? er.std.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : ""}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "12px", textAlign: "right", borderRight: "2px solid #999" }}>
                        {er ? er.earned.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : ""}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "12px", borderRight: "1px solid #ddd" }}>{dr?.label || ""}</td>
                      <td style={{ padding: "8px 10px", fontSize: "12px", textAlign: "right" }}>
                        {dr ? dr.val.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : ""}
                      </td>
                    </tr>
                  );
                })}
                {/* Blank filler rows to make table look full */}
                {Array.from({ length: Math.max(0, 5 - maxRows) }).map((_, i) => (
                  <tr key={`blank-${i}`} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "8px 10px", borderRight: "1px solid #ddd" }}>&nbsp;</td>
                    <td style={{ padding: "8px 10px", borderRight: "1px solid #ddd" }}></td>
                    <td style={{ padding: "8px 10px", borderRight: "2px solid #999" }}></td>
                    <td style={{ padding: "8px 10px", borderRight: "1px solid #ddd" }}></td>
                    <td style={{ padding: "8px 10px" }}></td>
                  </tr>
                ))}
                {/* Total Salary row */}
                <tr style={{ background: "#f0f0f0", borderTop: "2px solid #888" }}>
                  <td style={{ padding: "9px 10px", fontSize: "12px", fontWeight: "bold", borderRight: "1px solid #ccc" }}>Total Salary</td>
                  <td style={{ padding: "9px 10px", fontSize: "12px", fontWeight: "bold", textAlign: "right", borderRight: "1px solid #ccc" }}>
                    {safe(grossSalary).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: "12px", fontWeight: "bold", textAlign: "right", borderRight: "2px solid #999" }}>
                    {C.earn.gross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: "12px", fontWeight: "bold", borderRight: "1px solid #ccc" }}>Total Deductions</td>
                  <td style={{ padding: "9px 10px", fontSize: "12px", fontWeight: "bold", textAlign: "right" }}>
                    {C.ded.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                </tr>
                {/* Net Salary row — amount on first line, words on full-width second line */}
                <tr style={{ background: "#f0f0f0", borderTop: "1px solid #ccc" }}>
                  <td colSpan={2} style={{ padding: "11px 10px", fontSize: "13px", fontWeight: "bold", borderRight: "2px solid #999" }}>Net Salary</td>
                  <td colSpan={3} style={{ padding: "11px 10px" }}>
                    <span style={{ fontSize: "18px", fontWeight: "bold" }}>
                      {C.net.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                </tr>
                {/* Amount in words — full-width dedicated row */}
                <tr style={{ background: "#fafafa", borderTop: "1px solid #ddd" }}>
                  <td colSpan={5} style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: "11px", color: "#555", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.3px" }}>In Words: </span>
                    <span style={{ fontSize: "13px", fontWeight: "bold", fontStyle: "italic", color: "#1a1a1a" }}>
                      {C.words}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* STATUS NOTES */}
            <div style={{ textAlign: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "11px", color: "#666", border: "1px solid #ddd", padding: "4px 16px", display: "inline-block" }}>
                {isProbation ? "⚠ Probation Period — No Paid Leave" : `✔ Confirmed Employee — ${C.paidLeaveUsed} Paid Leave(s) Applied | LOP: ${C.lopDays} day(s)`}
              </span>
            </div>
            {noPF && (
              <div style={{ textAlign: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", color: "#888", border: "1px solid #eee", padding: "3px 14px", display: "inline-block" }}>
                  PF not applicable for this employee
                </span>
              </div>
            )}

            <p style={{ fontSize: "10px", textAlign: "center", color: "#aaa", borderTop: "1px solid #eee", paddingTop: "10px" }}>
              This is a computer-generated payslip. No physical signature is required. | Generated on {new Date().toLocaleDateString("en-IN")}
            </p>
          </div>

          {/* Download button BELOW payslip */}
          <div className="mt-4 flex justify-center">
            <Button onClick={downloadPDF}
              className="bg-slate-800 hover:bg-slate-900 text-white px-10 py-3 text-sm font-semibold tracking-wide shadow">
              Download Payslip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
