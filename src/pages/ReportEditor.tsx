import { ArrowLeft, Download, Info, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { OvertimeEditor } from '../components/OvertimeEditor';
import { useRedeemed } from '../components/RedeemedPanel';
import { useToast } from '../components/Toast';
import { Button, ConfirmDialog, EmptyState } from '../components/ui';
import { formatInvoiceNumber } from '../lib/calc';
import { generateInvoiceDraft, generateOvertimeDraft, redeemedInPeriod } from '../lib/drafts';
import { useStore } from '../lib/store';
import { todayIn } from '../lib/tz';
import type { Draft } from '../lib/types';
import { draftPeriod, draftTitle } from './Reports';

export function ReportEditor() {
  const { draftId } = useParams();
  const { t, data, profile, language, saveDraft, saveProfile } = useStore();
  const toast = useToast();
  const redeemed = useRedeemed();
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [busy, setBusy] = useState(false);

  const draft = data.drafts.find((d) => d.id === draftId && d.profileId === profile?.id);

  if (!profile || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/reports" className="inline-flex items-center gap-2 text-sm font-semibold text-tomato hover:underline">
          <ArrowLeft size={16} aria-hidden="true" />
          {t('reports.title')}
        </Link>
        <EmptyState icon={<Info size={24} />}>{t('reports.notFound')}</EmptyState>
      </div>
    );
  }

  const update = (next: Draft) => saveDraft({ ...next, edited: true, updatedAt: Date.now() });

  const regenerate = () => {
    const next =
      draft.type === 'invoice'
        ? generateInvoiceDraft(profile, data.entries, draft.periodStart.slice(0, 7), todayIn(profile.timeZone), draft)
        : generateOvertimeDraft(profile, data.entries, draft.periodStart, draft.periodEnd, draft);
    saveDraft(next);
    setConfirmRegen(false);
  };

  const download = async () => {
    setBusy(true);
    try {
      const excel = await import('../lib/excel');
      if (draft.type === 'invoice') {
        const file = await excel.downloadInvoice(draft);
        toast(t('reports.downloaded', { file }));
        // Move to the next invoice number only when this draft used the current one.
        if (draft.invoiceNumber === formatInvoiceNumber(profile.invoice.prefix, profile.invoice.nextNumber)) {
          const nextNumber = profile.invoice.nextNumber + 1;
          saveProfile({ ...profile, invoice: { ...profile.invoice, nextNumber } });
          toast(t('invoice.numberBumped', { number: formatInvoiceNumber(profile.invoice.prefix, nextNumber) }), { tone: 'info' });
        }
      } else {
        const file = await excel.downloadOvertime(profile.name, draft, redeemedInPeriod(redeemed, draft));
        toast(t('reports.downloaded', { file }));
      }
    } catch (error) {
      console.error(error);
      toast(t('reports.downloadFailed'), { tone: 'info' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link to="/reports" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-tomato hover:underline">
          <ArrowLeft size={16} aria-hidden="true" />
          {t('reports.title')}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{draft.type === 'invoice' ? draftTitle(draft, t, language) : t('reports.overtime')}</h1>
            <p className="mt-1 text-sm text-muted">
              {t('reports.period')}: {draftPeriod(draft, language)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => (draft.edited ? setConfirmRegen(true) : regenerate())}>
              <RefreshCw size={16} aria-hidden="true" />
              {t('reports.regenerate')}
            </Button>
            <Button variant="primary" onClick={download} disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
              {busy ? t('reports.downloading') : t('reports.download')}
            </Button>
          </div>
        </div>
        <p className="flex items-center gap-2 rounded-xl border border-sky/60 bg-sky-soft px-3 py-2 text-sm text-ink">
          <Info size={16} className="shrink-0" aria-hidden="true" />
          {t('reports.draftNote')}
        </p>
      </div>

      {draft.type === 'invoice' ? (
        <InvoiceEditor draft={draft} onChange={update} />
      ) : (
        <OvertimeEditor draft={draft} onChange={update} redeemed={redeemedInPeriod(redeemed, draft)} />
      )}

      <ConfirmDialog
        open={confirmRegen}
        title={t('reports.regenerateTitle')}
        body={t('reports.regenerateBody')}
        confirmLabel={t('reports.regenerate')}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={regenerate}
      />
    </div>
  );
}
