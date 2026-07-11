import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules, type ModuleName } from '@/hooks/useModules';

interface ModuleGuardProps {
  module: ModuleName;
  children: React.ReactNode;
}

// Renders children only when the module is enabled for the current clinic.
// Shows a bilingual "feature disabled" screen otherwise.
// Loading state renders nothing to avoid flash — modules load fast from localStorage.
const ModuleGuard: React.FC<ModuleGuardProps> = ({ module, children }) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { modules, loading } = useModules(user?.clinicId);
  const isAr = language === 'ar';

  // While loading from API, use localStorage optimistic value (already in modules).
  // loading=true means API refresh is in flight; the cached value is already shown.
  if (!loading && !modules[module]) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-6"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-9 w-9 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-bold text-foreground">
            {isAr ? 'الميزة غير مفعلة' : 'Feature Disabled'}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isAr
              ? 'هذه الوحدة غير مفعّلة لعيادتك. يرجى التواصل مع المسؤول لتفعيلها من إعدادات الوحدات.'
              : 'This module is not enabled for your clinic. Ask your admin to enable it from Settings → Modules.'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ModuleGuard;
