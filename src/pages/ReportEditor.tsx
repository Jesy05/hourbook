import { ArrowLeft, Download, FileDown, Info, LoaderCircle, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { OvertimeEditor } from '../components/OvertimeEditor';
import { PalettePicker } from '../components/PalettePicker';
import { useRedeemed } from '../components/RedeemedPanel';
import { useToast } from '../components/Toast';
import { Button, ConfirmDialog, EmptyState } from '../components/ui';
import { formatInvoiceNumber } from '../lib/calc';
import { generateInvoiceDraft, generateOvertimeDraft, redeemedInPeriod } from '../lib/drafts';
import { normalizePalette, type ExcelPalette } from '../lib/palettes';
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
  const [busy, setBusy] = useState<false | 'xlsx' | 'pdf'>(false);
  const latestProfile = useRef(profile);
  latestProfile.current = profile;

  const draft = data.drafts.find((d) => d.id === draftId && d.profileId === profile?.id);

  if (!profile || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/reports" className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
          <ArrowLeft size={16} aria-hidden="true" />
          {t('reports.title')}
        </Link>
        <EmptyState icon={<Info size={24} />}>{t('reports.notFound')}</EmptyState>
      </div>
    );
  }

  const update = (next: Draft) => saveDraft({ ...next, edited: true, updatedAt: Date.now() });

  // Colors are not content: changing them does not mark the draft as edited.
  // The choice is also remembered on the profile for the next report.
  const palette = normalizePalette(draft.palette ?? profile.excelPalette);
  const setPalette = (next: ExcelPalette, isCustom: boolean) => {
    saveDraft({ ...draft, palette: next, updatedAt: Date.now() });
    saveProfile({ ...profile, excelPalette: next, customPalette: isCustom ? next : profile.customPalette });
  };

  const regenerate = () => {
    const next =
      draft.type === 'invoice'
        ? generateInvoiceDraft(profile, data.entries, draft.periodStart, draft.periodEnd, todayIn(profile.timeZone), draft)
        : generateOvertimeDraft(profile, data.entries, draft.periodStart, draft.periodEnd, draft);
    saveDraft(next);
    setConfirmRegen(false);
  };

  /** After an invoice is exported, move to the next number (only if this draft used the current one), with undo. */
  const bumpInvoiceNumber = (invoiceNumber: string) => {
    const settings = profile.invoice;
    if (invoiceNumber !== formatInvoiceNumber(settings.prefix, settings.nextNumber, settings.padding)) return;
    const previous = settings.nextNumber;
    const bumped = previous + 1;
    saveProfile({ ...profile, invoice: { ...settings, nextNumber: bumped } });
    toast(t('invoice.numberBumped', { number: formatInvoiceNumber(settings.prefix, bumped, settings.padding) }), {
      tone: 'info',
      action: {
        label: t('reports.numberUndo'),
        onClick: () => {
          // Undo only if nothing else moved the number in the meantime.
          const current = latestProfile.current;
          if (current && current.invoice.nextNumber === bumped) saveProfile({ ...current, invoice: { ...current.invoice, nextNumber: previous } });
        },
      },
    });
  };

  const download = async (format: 'xlsx' | 'pdf' = 'xlsx') => {
    setBusy(format);
    try {
      if (draft.type === 'invoice') {
        const customFields = profile.customFields.filter((f) => f.enabled);
        const file =
          format === 'pdf'
            ? await (await import('../lib/pdf')).downloadInvoicePdf(draft, customFields, profile.invoice.fileNameTemplate)
            : await (await import('../lib/excel')).downloadInvoice(draft, customFields, profile.invoice.fileNameTemplate);
        toast(t('reports.downloaded', { file }));
        bumpInvoiceNumber(draft.invoiceNumber);
      } else {
        const excel = await import('../lib/excel');
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
        <Link to="/reports" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand hover:underline">
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
            <Button variant="primary" onClick={() => download('xlsx')} disabled={!!busy} aria-busy={busy === 'xlsx'}>
              {busy === 'xlsx' ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
              {busy === 'xlsx' ? t('reports.downloading') : t('reports.download')}
            </Button>
            {draft.type === 'invoice' && (
              <Button variant="secondary" onClick={() => download('pdf')} disabled={!!busy} aria-busy={busy === 'pdf'}>
                {busy === 'pdf' ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <FileDown size={18} aria-hidden="true" />}
                {busy === 'pdf' ? t('reports.downloading') : t('reports.downloadPdf')}
              </Button>
            )}
          </div>
        </div>
        <p className="flex items-center gap-2 rounded-xl border border-sky/60 bg-sky-soft px-3 py-2 text-sm text-ink">
          <Info size={16} className="shrink-0" aria-hidden="true" />
          {t('reports.draftNote')}
        </p>
      </div>

      <PalettePicker palette={palette} saved={profile.customPalette} onChange={setPalette} />

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
