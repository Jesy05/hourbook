import { Languages } from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ProfileForm } from '../components/ProfileForm';
import { Button } from '../components/ui';
import { newProfile } from '../lib/defaults';
import { useStore } from '../lib/store';

export function Setup() {
  const { t, data, saveProfile, setActiveProfile, language, setLanguage } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [initial] = useState(newProfile);
  const adding = params.get('new') === '1';

  if (data.profiles.length > 0 && !adding) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo size={56} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {adding ? t('setup.addTitle') : t('setup.title')}
              </h1>
              <p className="text-sm text-muted">{t('setup.intro')}</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
            aria-label={`${t('settings.language')}: ${language === 'es' ? 'English' : 'Español'}`}
          >
            <Languages size={16} aria-hidden="true" />
            {language === 'es' ? 'English' : 'Español'}
          </Button>
        </div>

        <ProfileForm
          initial={initial}
          submitLabel={t('setup.create')}
          extraActions={
            adding && data.profiles.length > 0 ? <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button> : null
          }
          onSubmit={(profile) => {
            saveProfile(profile);
            setActiveProfile(profile.id);
            navigate('/');
          }}
        />
      </div>
    </div>
  );
}
