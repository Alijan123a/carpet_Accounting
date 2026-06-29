import { useState, type ReactNode } from 'react'
import { formatMoney, formatCents, type DevReport } from '@shared/accounting'
import { Button } from '@renderer/components/ui/button'

/**
 * TEMPORARY Phase 1 verification page.
 *
 * Reseeds a small, hand-checkable data set and prints the balances/profit the
 * accounting engine computes, so the numbers can be verified by hand. AFN and
 * USD are shown in SEPARATE columns and never summed. Remove after Phase 1.
 */
export function DevTest(): JSX.Element {
  const [report, setReport] = useState<DevReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.devResetSeedCompute()
      setReport(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Phase 1 — Accounting Core Verification</h2>
        <p className="text-sm text-muted-foreground">
          Reseeds sample data and prints computed balances &amp; profit. AFN and USD are kept
          separate. This page is temporary.
        </p>
      </div>

      <Button onClick={run} disabled={busy}>
        {busy ? 'Running…' : 'Reset, seed & compute'}
      </Button>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <Section title={`Client balances (positive = client owes us)`}>
            <Table head={['Client', 'AFN', 'USD']}>
              {report.clients.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <Td>{c.name}</Td>
                  <Td mono>{formatCents(c.balances.AFN)}</Td>
                  <Td mono>{formatCents(c.balances.USD)}</Td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Carpets (profit = sell total − buy total)">
            <Table head={['Label', 'Cur', 'Status', 'Buy', 'Sell', 'Profit']}>
              {report.carpets.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <Td>{c.label}</Td>
                  <Td>{c.currency}</Td>
                  <Td>{c.status}</Td>
                  <Td mono>{formatCents(c.buyTotalCents)}</Td>
                  <Td mono>{c.sellTotalCents == null ? '—' : formatCents(c.sellTotalCents)}</Td>
                  <Td mono>{c.profitCents == null ? '—' : formatCents(c.profitCents)}</Td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Materials (tar)">
            <Table head={['Name', 'Cur', 'Bought kg', 'Sold kg', 'Avg buy/kg', 'Profit']}>
              {report.materials.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <Td>{m.name}</Td>
                  <Td>{m.currency}</Td>
                  <Td mono>{m.boughtKg}</Td>
                  <Td mono>{m.soldKg}</Td>
                  <Td mono>{formatCents(m.avgBuyPerKgCents)}</Td>
                  <Td mono>{formatCents(m.profitCents)}</Td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Period profit — all time (per currency, never combined)">
            <Table head={['Currency', 'Gross', 'Expenses', 'Net']}>
              {(['AFN', 'USD'] as const).map((cur) => {
                const p = report.period[cur]
                return (
                  <tr key={cur} className="border-t border-border">
                    <Td>{cur}</Td>
                    <Td mono>{formatMoney(p.grossProfitCents, cur)}</Td>
                    <Td mono>{formatMoney(p.expensesCents, cur)}</Td>
                    <Td mono>{formatMoney(p.netProfitCents, cur)}</Td>
                  </tr>
                )
              })}
            </Table>
          </Section>

          <p className="text-xs text-muted-foreground">
            {report.transactionsCount} transactions posted (immutable ledger).
          </p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Table({ head, children }: { head: string[]; children: ReactNode }): JSX.Element {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-start text-muted-foreground">
          {head.map((h) => (
            <th key={h} className="pb-1 text-start font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function Td({ children, mono }: { children: ReactNode; mono?: boolean }): JSX.Element {
  return <td className={`py-1 ${mono ? 'font-mono tabular-nums' : ''}`}>{children}</td>
}
