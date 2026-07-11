import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { protocolStore, ClinicalProtocol } from '@/stores/protocolStore';
import { useSpecialties } from '@/hooks/useSpecialties';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen, Search, Sparkles, RefreshCw, Plus, FileText,
  Trash2, Download, Stethoscope, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';

type LibView = 'list' | 'search' | 'protocol';

const MedicalLibrary: React.FC = () => {
  const { isAr, language } = useLanguage();
  const { user } = useAuth();
  const { specialties } = useSpecialties();

  const [view, setView] = useState<LibView>('list');
  const [protocols, setProtocols] = useState<ClinicalProtocol[]>(() => protocolStore.getAll());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSpecialty, setSearchSpecialty] = useState('__all__');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Protocol generator
  const [condition, setCondition] = useState('');
  const [protocolSpecialty, setProtocolSpecialty] = useState('');
  const [generatedProtocol, setGeneratedProtocol] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Selected protocol for view
  const [selectedProtocol, setSelectedProtocol] = useState<ClinicalProtocol | null>(null);

  useEffect(() => {
    const unsub = protocolStore.subscribe(() => setProtocols(protocolStore.getAll()));
    return unsub;
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch('/api/medical-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, specialty: searchSpecialty === '__all__' ? '' : searchSpecialty }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      toast.error(isAr ? 'فشل البحث' : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateProtocol = async () => {
    if (!condition.trim()) return;
    setIsGenerating(true);
    setGeneratedProtocol('');
    try {
      const res = await fetch('/api/generate-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, specialty: protocolSpecialty, language }),
      });
      const data = await res.json();
      setGeneratedProtocol(data.protocol || '');
    } catch {
      toast.error(isAr ? 'فشل في توليد البروتوكول' : 'Protocol generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveProtocol = () => {
    if (!generatedProtocol.trim() || !condition.trim()) return;
    const now = new Date().toISOString();
    protocolStore.add({
      id: `prot-${Date.now()}`,
      clinicId: user?.clinicId || '',
      condition,
      conditionAr: condition,
      specialty: protocolSpecialty,
      content: generatedProtocol,
      language: language as 'ar' | 'en',
      isAiGenerated: true,
      createdBy: user?.id || '',
      createdAt: now,
      updatedAt: now,
    });
    toast.success(isAr ? 'تم حفظ البروتوكول' : 'Protocol saved');
    setCondition('');
    setGeneratedProtocol('');
    setView('list');
  };

  const handleDownload = (p: ClinicalProtocol) => {
    const blob = new Blob([`${p.condition}\n${'─'.repeat(40)}\n\n${p.content}`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `protocol_${p.condition.replace(/\s/g, '_')}.txt`;
    a.click();
  };

  const categoryColor: Record<string, string> = {
    diagnosis: 'bg-primary/10 text-primary',
    treatment: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    drug: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    guideline: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    anatomy: 'bg-destructive/10 text-destructive',
    general: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isAr ? 'المكتبة الطبية' : 'Medical Library'}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? 'بحث طبي ذكي وبروتوكولات علاجية' : 'AI-powered medical search & clinical protocols'}</p>
        </div>
      </div>

      <Tabs defaultValue="protocols">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="protocols" className="gap-1.5">
            <FileText className="h-4 w-4" />{isAr ? 'البروتوكولات' : 'Protocols'}
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-1.5">
            <Search className="h-4 w-4" />{isAr ? 'بحث طبي' : 'Medical Search'}
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5">
            <Sparkles className="h-4 w-4" />{isAr ? 'توليد بروتوكول' : 'Generate Protocol'}
          </TabsTrigger>
        </TabsList>

        {/* Protocols list */}
        <TabsContent value="protocols" className="space-y-4 mt-4">
          {protocols.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">{isAr ? 'لا توجد بروتوكولات بعد' : 'No protocols yet'}</p>
                <p className="text-sm mt-1">{isAr ? 'أنشئ بروتوكولاً جديداً من تبويب "توليد بروتوكول"' : 'Create one from the "Generate Protocol" tab'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {protocols.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(p => (
                <Card key={p.id} className="hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setSelectedProtocol(selectedProtocol?.id === p.id ? null : p)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Stethoscope className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm">{p.condition}</span>
                          {p.isAiGenerated && <Badge variant="outline" className="text-xs gap-1"><Sparkles className="h-3 w-3" />AI</Badge>}
                        </div>
                        {p.specialty && <p className="text-xs text-muted-foreground mb-2">{p.specialty}</p>}
                        <p className="text-xs text-muted-foreground line-clamp-2">{p.content.slice(0, 100)}...</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(p.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={e => { e.stopPropagation(); handleDownload(p); }}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); protocolStore.remove(x => x.id === p.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {selectedProtocol?.id === p.id && (
                      <div className="mt-3 pt-3 border-t">
                        <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed text-foreground">{p.content}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* AI Medical Search */}
        <TabsContent value="search" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder={isAr ? 'ابحث عن تشخيص، دواء، إجراء...' : 'Search diagnosis, drug, procedure...'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="text-sm flex-1"
                />
                <Select value={searchSpecialty} onValueChange={setSearchSpecialty}>
                  <SelectTrigger className="w-36 text-sm">
                    <SelectValue placeholder={isAr ? 'التخصص' : 'Specialty'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{isAr ? 'الكل' : 'All'}</SelectItem>
                    {specialties.map(s => (
                      <SelectItem key={s.id} value={s.name}>{isAr ? s.nameAr : s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className="gap-1.5">
                  {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isAr ? 'بحث' : 'Search'}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3 pt-2">
                  {searchResults.map((r, i) => (
                    <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{isAr ? r.titleAr : r.title}</span>
                        {r.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor[r.category] || categoryColor.general}`}>
                            {r.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed">{isAr ? r.contentAr : r.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Generate Protocol */}
        <TabsContent value="generate" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase">{isAr ? 'الحالة المرضية' : 'Condition / Disease'}</label>
                  <Input
                    placeholder={isAr ? 'مثال: ارتفاع ضغط الدم...' : 'e.g. Hypertension, Type 2 Diabetes...'}
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase">{isAr ? 'التخصص' : 'Specialty'}</label>
                  <Select value={protocolSpecialty} onValueChange={setProtocolSpecialty}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={isAr ? 'اختر التخصص' : 'Select specialty'} />
                    </SelectTrigger>
                    <SelectContent>
                      {specialties.map(s => (
                        <SelectItem key={s.id} value={s.name}>{isAr ? s.nameAr : s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={handleGenerateProtocol} disabled={isGenerating || !condition.trim()}>
                {isGenerating
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />{isAr ? 'جارٍ التوليد...' : 'Generating...'}</>
                  : <><Sparkles className="h-4 w-4" />{isAr ? 'توليد بروتوكول بالذكاء الاصطناعي' : 'Generate AI Protocol'}</>}
              </Button>

              {generatedProtocol && (
                <div className="space-y-3">
                  <Textarea
                    rows={14}
                    value={generatedProtocol}
                    onChange={e => setGeneratedProtocol(e.target.value)}
                    className="resize-none text-sm font-mono"
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                  />
                  <Button className="w-full gap-1.5" onClick={handleSaveProtocol}>
                    <Plus className="h-4 w-4" />{isAr ? 'حفظ في المكتبة' : 'Save to Library'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MedicalLibrary;
