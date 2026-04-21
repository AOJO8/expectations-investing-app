from __future__ import annotations
import streamlit as st
import yfinance as yf
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots


# ── Page Config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Investment Dashboard",
    page_icon="📈",
    layout="wide",
)

# ── Helpers ───────────────────────────────────────────────────────────────────

@st.cache_data(ttl=3600)
def get_risk_free_rate() -> float:
    """Pull live 10-year US Treasury yield from Yahoo Finance (^TNX)."""
    try:
        hist = yf.Ticker("^TNX").history(period="5d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1]) / 100
    except Exception:
        pass
    return 0.045  # fallback if fetch fails


@st.cache_data(ttl=3600)
def get_company_data(symbol: str):
    t = yf.Ticker(symbol)
    return t.info, t.cashflow, t.balance_sheet, t.financials


def calculate_fcf(cashflow: pd.DataFrame):
    """Return a sorted Series of annual FCF (Operating CF + CapEx)."""
    if cashflow is None or cashflow.empty:
        return None
    try:
        op_cf = None
        for key in ["Operating Cash Flow", "Total Cash From Operating Activities"]:
            if key in cashflow.index:
                op_cf = cashflow.loc[key]
                break
        if op_cf is None:
            return None

        capex = pd.Series(0, index=op_cf.index)
        for key in ["Capital Expenditure", "Capital Expenditures"]:
            if key in cashflow.index:
                capex = cashflow.loc[key]
                break

        fcf = (op_cf + capex).dropna().iloc[:5]  # CapEx is negative → add
        return fcf.sort_index()
    except Exception:
        return None


def calculate_wacc(info, balance_sheet, financials, rfr: float, mrp: float) -> dict:
    """Calculate WACC and return a dict of all components."""
    # ── Cost of Equity (CAPM) ──
    beta = float(info.get("beta") or 1.0)
    ke = rfr + beta * mrp

    # ── Cost of Debt ──
    interest = 0.0
    if financials is not None and not financials.empty:
        for key in ["Interest Expense", "Interest Expense Non Operating"]:
            if key in financials.index:
                interest = abs(float(financials.loc[key].iloc[0] or 0))
                break

    total_debt = 0.0
    if balance_sheet is not None and not balance_sheet.empty:
        ltd = stb = 0.0
        if "Long Term Debt" in balance_sheet.index:
            ltd = float(balance_sheet.loc["Long Term Debt"].iloc[0] or 0)
        for key in ["Short Long Term Debt", "Current Debt"]:
            if key in balance_sheet.index:
                stb = float(balance_sheet.loc[key].iloc[0] or 0)
                break
        total_debt = ltd + stb

    kd = (interest / total_debt) if total_debt > 0 else rfr + 0.01

    # ── Tax Rate ──
    tax_rate = 0.21
    if financials is not None and not financials.empty:
        try:
            tax = pretax = None
            for key in ["Tax Provision", "Income Tax Expense"]:
                if key in financials.index:
                    tax = abs(float(financials.loc[key].iloc[0] or 0))
                    break
            for key in ["Pretax Income", "Income Before Tax"]:
                if key in financials.index:
                    pretax = float(financials.loc[key].iloc[0] or 0)
                    break
            if tax is not None and pretax and pretax > 0:
                tax_rate = min(tax / pretax, 0.40)
        except Exception:
            pass

    # ── Weights ──
    mktcap = float(info.get("marketCap") or 0)
    total_capital = mktcap + total_debt
    we = mktcap / total_capital if total_capital > 0 else 0.8
    wd = total_debt / total_capital if total_capital > 0 else 0.2

    wacc = we * ke + wd * kd * (1 - tax_rate)

    return dict(
        beta=beta, rfr=rfr, mrp=mrp, ke=ke,
        kd=kd, tax_rate=tax_rate,
        mktcap=mktcap, total_debt=total_debt,
        we=we, wd=wd, wacc=wacc,
    )


def fmt(value: float) -> str:
    """Format large dollar figures."""
    av = abs(value)
    if av >= 1e12:
        return f"${value/1e12:.2f}T"
    if av >= 1e9:
        return f"${value/1e9:.2f}B"
    if av >= 1e6:
        return f"${value/1e6:.2f}M"
    return f"${value:,.0f}"


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Settings")
    ticker_input = st.text_input("Ticker Symbol", value="AAPL").upper().strip()
    mrp_input = st.slider(
        "Market Risk Premium (%)",
        min_value=3.0, max_value=9.0, value=5.5, step=0.1,
    ) / 100
    st.caption("Equity risk premium above the risk-free rate. Historical average ≈ 5.5%.")
    st.markdown("---")
    st.caption("Data: Yahoo Finance · Treasury: ^TNX (live)")

# ── Load Data ─────────────────────────────────────────────────────────────────
st.title("Investment Dashboard")

with st.spinner(f"Fetching data for **{ticker_input}**…"):
    rfr = get_risk_free_rate()
    info, cashflow, balance_sheet, financials = get_company_data(ticker_input)

company_name = info.get("longName", ticker_input)
sector       = info.get("sector", "N/A")
price        = info.get("currentPrice") or info.get("regularMarketPrice") or 0
mktcap       = info.get("marketCap") or 0
pe           = info.get("trailingPE")

# ── Company Header ────────────────────────────────────────────────────────────
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Company", company_name)
c2.metric("Price", f"${price:,.2f}")
c3.metric("Market Cap", fmt(mktcap))
c4.metric("Sector", sector)
c5.metric("P/E (TTM)", f"{pe:.1f}x" if pe else "N/A")
st.markdown("---")

# ── Free Cash Flow ────────────────────────────────────────────────────────────
st.subheader("Free Cash Flow — Last 5 Years")

fcf_series = calculate_fcf(cashflow)

if fcf_series is not None and not fcf_series.empty:
    fcf_df = pd.DataFrame({
        "Year": [d.year for d in fcf_series.index],
        "FCF":  fcf_series.values,
    }).sort_values("Year").reset_index(drop=True)

    fcf_df["Growth"] = fcf_df["FCF"].pct_change() * 100

    n = len(fcf_df)
    cagr = ((fcf_df["FCF"].iloc[-1] / fcf_df["FCF"].iloc[0]) ** (1 / (n - 1)) - 1) * 100 if n >= 2 else 0.0

    colors = ["#ef4444" if v < 0 else "#22c55e" for v in fcf_df["FCF"]]

    fig_fcf = make_subplots(specs=[[{"secondary_y": True}]])

    fig_fcf.add_trace(
        go.Bar(
            x=fcf_df["Year"], y=fcf_df["FCF"] / 1e9,
            name="FCF ($B)", marker_color=colors,
            text=[fmt(v) for v in fcf_df["FCF"]], textposition="outside",
        ),
        secondary_y=False,
    )
    fig_fcf.add_trace(
        go.Scatter(
            x=fcf_df["Year"], y=fcf_df["Growth"],
            name="YoY Growth (%)", mode="lines+markers",
            line=dict(color="#6366f1", width=2), marker=dict(size=8),
        ),
        secondary_y=True,
    )
    fig_fcf.update_layout(
        height=420,
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(tickmode="linear", dtick=1),
    )
    fig_fcf.update_yaxes(title_text="FCF ($ Billions)", secondary_y=False)
    fig_fcf.update_yaxes(title_text="YoY Growth (%)", secondary_y=True, showgrid=False)

    st.plotly_chart(fig_fcf, use_container_width=True)

    m1, m2, m3, m4 = st.columns(4)
    latest_fcf = fcf_df["FCF"].iloc[-1]
    m1.metric("Latest FCF",      fmt(latest_fcf))
    m2.metric("5Y CAGR",         f"{cagr:.1f}%")
    m3.metric("Avg Annual FCF",  fmt(fcf_df["FCF"].mean()))
    m4.metric("FCF Yield",       f"{(latest_fcf / mktcap * 100):.2f}%" if mktcap else "N/A")

else:
    st.warning("Could not retrieve cash flow data. Check the ticker symbol and try again.")
    fcf_df, latest_fcf = None, None

st.markdown("---")

# ── WACC ──────────────────────────────────────────────────────────────────────
st.subheader("WACC — Weighted Average Cost of Capital")

w = calculate_wacc(info, balance_sheet, financials, rfr, mrp_input)

fcf_yield_pct = (latest_fcf / mktcap * 100) if (latest_fcf and mktcap) else None

col_gauge, col_table = st.columns([1, 1])

with col_gauge:
    fig_gauge = go.Figure(go.Indicator(
        mode="gauge+number",
        value=w["wacc"] * 100,
        number={"suffix": "%", "valueformat": ".2f"},
        title={"text": "WACC"},
        gauge={
            "axis": {"range": [0, 20], "ticksuffix": "%"},
            "bar":  {"color": "#6366f1"},
            "steps": [
                {"range": [0,  5], "color": "#dcfce7"},
                {"range": [5, 10], "color": "#fef9c3"},
                {"range": [10, 20], "color": "#fee2e2"},
            ],
            "threshold": {
                "line": {"color": "#ef4444", "width": 4},
                "thickness": 0.75,
                "value": fcf_yield_pct or w["wacc"] * 100,
            },
        },
    ))
    fig_gauge.update_layout(
        height=320, paper_bgcolor="rgba(0,0,0,0)",
        annotations=[dict(
            text=f"Red line = FCF Yield ({fcf_yield_pct:.2f}%)" if fcf_yield_pct else "",
            x=0.5, y=-0.05, showarrow=False, font=dict(size=11, color="gray"),
        )],
    )
    st.plotly_chart(fig_gauge, use_container_width=True)

with col_table:
    st.markdown("**WACC Components**")
    rows = [
        ("Risk-Free Rate (10Y Treasury)", f"{w['rfr']*100:.2f}%"),
        ("Beta (β)",                      f"{w['beta']:.2f}"),
        ("Market Risk Premium",           f"{w['mrp']*100:.1f}%"),
        ("Cost of Equity  Ke = Rf + β·MRP", f"{w['ke']*100:.2f}%"),
        ("",                              ""),
        ("Cost of Debt (pre-tax)",        f"{w['kd']*100:.2f}%"),
        ("Effective Tax Rate",            f"{w['tax_rate']*100:.1f}%"),
        ("After-Tax Cost of Debt",        f"{w['kd']*(1-w['tax_rate'])*100:.2f}%"),
        ("",                              ""),
        ("Weight of Equity",              f"{w['we']*100:.1f}%"),
        ("Weight of Debt",                f"{w['wd']*100:.1f}%"),
        ("Market Cap",                    fmt(w["mktcap"])),
        ("Total Debt",                    fmt(w["total_debt"])),
        ("",                              ""),
        ("**WACC**",                      f"**{w['wacc']*100:.2f}%**"),
    ]
    for label, value in rows:
        if label == "":
            st.markdown(" ")
        else:
            a, b = st.columns([3, 1])
            a.markdown(label)
            b.markdown(value)

st.markdown("---")

# ── Capital Structure ─────────────────────────────────────────────────────────
st.subheader("Capital Structure & WACC Contribution")

cs1, cs2 = st.columns(2)

with cs1:
    fig_pie = go.Figure(go.Pie(
        labels=["Equity", "Debt"],
        values=[w["we"], w["wd"]],
        hole=0.55,
        marker_colors=["#6366f1", "#f59e0b"],
        textinfo="label+percent",
    ))
    fig_pie.update_layout(
        title="Capital Structure Weights",
        height=320, paper_bgcolor="rgba(0,0,0,0)", showlegend=False,
    )
    st.plotly_chart(fig_pie, use_container_width=True)

with cs2:
    equity_contrib = w["we"] * w["ke"] * 100
    debt_contrib   = w["wd"] * w["kd"] * (1 - w["tax_rate"]) * 100

    fig_contrib = go.Figure(go.Bar(
        x=["Equity\nContribution", "Debt Contribution\n(after-tax)", "WACC"],
        y=[equity_contrib, debt_contrib, w["wacc"] * 100],
        marker_color=["#6366f1", "#f59e0b", "#22c55e"],
        text=[f"{equity_contrib:.2f}%", f"{debt_contrib:.2f}%", f"{w['wacc']*100:.2f}%"],
        textposition="outside",
    ))
    fig_contrib.update_layout(
        title="WACC Contribution Breakdown",
        yaxis_title="Contribution (%)",
        height=320,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    st.plotly_chart(fig_contrib, use_container_width=True)

# ── Value Creation Analysis ───────────────────────────────────────────────────
if fcf_yield_pct is not None:
    st.markdown("---")
    st.subheader("Value Creation Analysis — FCF Yield vs WACC")

    spread = fcf_yield_pct - w["wacc"] * 100

    v1, v2, v3 = st.columns(3)
    v1.metric("FCF Yield",  f"{fcf_yield_pct:.2f}%")
    v2.metric("WACC",       f"{w['wacc']*100:.2f}%")
    v3.metric(
        "Spread (FCF Yield − WACC)",
        f"{spread:.2f}%",
        delta="Value Creating ✓" if spread > 0 else "Value Destroying ✗",
        delta_color="normal" if spread > 0 else "inverse",
    )

    if spread > 0:
        st.success(
            f"**{company_name}** generates a free cash flow yield of **{fcf_yield_pct:.2f}%** "
            f"vs a WACC of **{w['wacc']*100:.2f}%** — the business is creating shareholder value "
            f"at current prices (spread: +{spread:.2f}%)."
        )
    else:
        st.warning(
            f"**{company_name}**'s FCF yield of **{fcf_yield_pct:.2f}%** falls below its WACC of "
            f"**{w['wacc']*100:.2f}%** — the stock may be priced for perfection or the business "
            f"is not generating returns above its cost of capital (spread: {spread:.2f}%)."
        )

    # Visual comparison bar
    fig_vs = go.Figure()
    fig_vs.add_trace(go.Bar(
        x=["FCF Yield", "WACC"],
        y=[fcf_yield_pct, w["wacc"] * 100],
        marker_color=["#22c55e", "#6366f1"],
        text=[f"{fcf_yield_pct:.2f}%", f"{w['wacc']*100:.2f}%"],
        textposition="outside",
        width=0.4,
    ))
    fig_vs.update_layout(
        title="FCF Yield vs WACC",
        yaxis_title="(%)",
        height=320,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
    )
    st.plotly_chart(fig_vs, use_container_width=True)

st.markdown("---")
st.caption(
    f"Data via Yahoo Finance (yfinance). 10Y Treasury yield: {rfr*100:.2f}% (live). "
    f"Market risk premium: {mrp_input*100:.1f}%. WACC uses CAPM for cost of equity."
)