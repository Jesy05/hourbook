import { Database, Download, Languages, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileForm } from '../components/ProfileForm';
import { useToast } from '../components/Toast';
import { Button, Card, ConfirmDialog, Field, TextInput } from '../components/ui';
import { downloadBlob } from '../lib/download';
import { backupFileContent, parseBackup } from '../lib/storage';
import { useStore } from '../lib/store';
import type { AppData } from '../lib/types';

export function Settings() {
  const { t, data, profile, saveProfile, deleteProfile, language, setLanguage, replaceAll, clearAll } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [confirmProfile, setConfirmProfile] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [typed, setTyped] = useState('');

  if (!profile) return null;

  const exportBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([backupFileContent(data)], { type: 'application/json' }), `hourbook-backup-${stamp}.json`);
    toast(t('settings.exported'));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed) toast(t('settings.importInvalid'), { tone: 'info' });
      else setPendingImport(parsed);
    } catch {
      toast(t('settings.importInvalid'), { tone: 'info' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('settings.title')}</h1>

      <Card title={t('settings.language')} icon={<Languages size={20} />}>
        <p className="mb-3 text-sm text-muted">{t('settings.languageHint')}</p>
        <div className="inline-flex rounded-xl border border-line bg-canvas p-1" role="radiogroup" aria-label={t('settings.language')}>
          {(['es', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={language === lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                language === lang ? 'bg-tomato text-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {lang === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </Card>

      <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
        <h2 id="profile-heading" className="text-xl font-semibold">
          {t('settings.profile')}: {profile.name}
        </h2>
        <ProfileForm
          key={profile.id}
          initial={profile}
          submitLabel={t('common.save')}
          onSubmit={(next) => {
            saveProfile(next);
            toast(t('settings.saved'));
          }}
          extraActions={
            <Button variant="danger" onClick={() => setConfirmProfile(true)}>
              <Trash2 size={16} aria-hidden="true" />
              {t('settings.deleteProfile')}
            </Button>
          }
        />
      </section>

      <Card title={t('settings.data')} icon={<Database size={20} />}>
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-peach bg-peach-soft p-3 text-sm text-ink">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-tomato" aria-hidden="true" />
          {t('settings.dataWarning')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="info" onClick={exportBackup}>
            <Download size={16} aria-hidden="true" />
            {t('settings.export')}
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            {t('settings.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button variant="danger" className="sm:ml-auto" onClick={() => setConfirmAll(true)}>
            <Trash2 size={16} aria-hidden="true" />
            {t('settings.deleteAll')}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={!!pendingImport}
        title={t('settings.importTitle')}
        body={t('settings.importBody', {
          profiles: pendingImport?.profiles.length ?? 0,
          entries: pendingImport?.entries.length ?? 0,
        })}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) replaceAll(pendingImport);
          setPendingImport(null);
          toast(t('settings.imported'));
          navigate('/');
        }}
      />

      <ConfirmDialog
        open={confirmProfile}
        title={t('settings.deleteProfileTitle')}
        body={t('settings.deleteProfileBody', { name: profile.name })}
        confirmLabel={t('common.delete')}
        onCancel={() => setConfirmProfile(false)}
        onConfirm={() => {
          setConfirmProfile(false);
          deleteProfile(profile.id);
          navigate(data.profiles.length > 1 ? '/' : '/setup');
        }}
      />

      <ConfirmDialog
        open={confirmAll}
        title={t('settings.deleteAllTitle')}
        body={t('settings.deleteAllBody')}
        confirmLabel={t('common.delete')}
        confirmDisabled={typed.trim().toUpperCase() !== t('settings.deleteAllWord')}
        onCancel={() => {
          setConfirmAll(false);
          setTyped('');
        }}
        onConfirm={() => {
          setConfirmAll(false);
          setTyped('');
          clearAll();
          navigate('/setup');
        }}
      >
        <Field label={t('settings.deleteAllInput')} className="mt-4">
          {(p) => <TextInput {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
