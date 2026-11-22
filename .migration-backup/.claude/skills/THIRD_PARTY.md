# مهارات من برّه (اتركّبت ٢٠٢٦-١١-٠٩ بطلب المالك)

اتنسخت زى ما هى (من غير تعديل) — المهارات بس، **من غير** hook بداية الجلسة بتاع Superpowers
(اللى بيضيف سياق مع كل جلسة ويزوّد الاستهلاك). كلود بيفتح أى مهارة لما الشغل يحتاجها بس.

| المصدر | النسخة | المهارات | الرخصة |
|---|---|---|---|
| github.com/obra/superpowers | 22f0b46 (2026-11-03) | brainstorming · dispatching-parallel-agents · executing-plans · finishing-a-development-branch · receiving-code-review · requesting-code-review · subagent-driven-development · systematic-debugging · test-driven-development · using-git-worktrees · verification-before-completion · writing-plans · writing-skills | MIT (`SUPERPOWERS-LICENSE.txt`) |
| github.com/forrestchang/andrej-karpathy-skills | 2c60614 (2026-04-20) | karpathy-guidelines | MIT |
| github.com/anthropics/skills | 2c5958e (2026-11-06) | mcp-builder · webapp-testing · frontend-design | Apache-2.0 (`LICENSE.txt` جوّه كل مهارة) |
| github.com/morluto/rea (REA) | 3345019 (2026-11-10، بطلب المالك) | reverse-engineer-anything | MIT (`LICENSE.txt` جوّه المهارة) |
| github.com/cth9191/animate | 7e5eb56 (2026-10-05، بطلب المالك ٢٠٢٦-١١-١٧) | animate | MIT (`LICENSE.txt` جوّه المهارة) |
| github.com/NVIDIA/skillspector | a09091e (2026-11-16، بطلب المالك ٢٠٢٦-١١-١٧) | skill-inspector | Apache-2.0 (`LICENSE.txt` جوّه المهارة) |
| github.com/Jakeschincariol/replica-skill | 77c9436 (2026-10-03، بطلب المالك ٢٠٢٦-١١-١٨) | replica-recon · replica-architect · replica-design · replica-build · replica-backend · replica-test · replica-diff · replica-entrepreneur · replica-brand · replica-launch · replica-deploy | MIT (`LICENSE.txt` جوّه كل مهارة) |

اتسابت: `using-superpowers` و`diagnosing-superpowers` (بيشتغلوا مع الـplugin والـhook)،
وskill-creator/claude-api/docx/pdf/pptx/xlsx (موجودين أصلاً)، والباقى مالوش علاقة بشغلنا.

⚠️ قواعد `CLAUDE.md` بتتقدّم على أى مهارة — خصوصاً: الرفع على فرع واحد بس
(`claude/build-oscardevs-ads-mvp-8krfN`)، فمهارات زى using-git-worktrees وfinishing-a-development-branch
ماتعملش فروع ولا PR جديدة.

### REA: Reverse Engineer Anything (٢٠٢٦-١١-١٠)
المهارة تعليمات بس، ومش بتركّب حاجة ولا بتشغّل كود. أدوات REA نفسها (MCP + محرّكات زى Ghidra/JADX) **مش متركّبة**،
وبتتركّب وقت ما نحتاجها بأمر واحد: `npx rea-agents setup` (أو من غير تسجيل: `npx rea-agents --help`).
⚠️ للاستخدام على تطبيقات وملفات إحنا من حقنا نحلّلها (تطبيقاتنا، أو تحليل مسموح بيه)، مش لكسر حماية أو ترخيص.

### المهارات الخمسة (٢٠٢٦-١١-١٧، `docs/SKILLS_REVIEW_2026-11-17.md`)
شرط المالك: «طالما مفيش خطورة أمنية ومفيش زيادة فى استهلاك التوكنز». المهارة بتتحمّل لما الشغل يحتاجها بس، ووصفها سطر واحد فى القايمة.
- **animate** (فيديو قصير بالكود ← MP4): اتفحصت بـSkillSpector `--no-llm` + مراجعة بالإيد. الـ١٩ «HIGH» = الفاحص ماقراش ملفات
  الـJS كاملة (analysis coverage)، مش سلوك. الباقى: محاذاة تعليقات، رموز رياضة، ffmpeg بقايمة arguments (من غير shell)،
  وbase64 لصور وصوت محليين. **مفيش أى اتصال بالنت فى أدواتها**، ولا حروف مخفية. محتاجة Playwright + ffmpeg (موجودين فى بيئة كلود).
- **skill-inspector**: بتشغّل `skillspector scan <المهارة> --no-llm` قبل تركيب أى مهارة جديدة. الأداة نفسها مش متركّبة:
  `python3.13 -m venv /tmp/ss && /tmp/ss/bin/pip install git+https://github.com/NVIDIA/skillspector@a09091e`. ⛔ من غير `--llm`
  (بيبعت محتوى المهارة لمزوّد برّه).
- **اتسابوا:** ponytail (hooks بتضيف تعليمات وخريطة للمستودع مع كل جلسة ⇒ توكنز زيادة دايماً) · freellmapi (مش مهارة؛ بيبعت البرومبتات
  لمزوّدين برّه) · Agent-Reach (بينسخ جلسة كروم وبيخزّن كوكيز الحسابات على الجهاز، فأى برنامج تانى يقدر يوصلها، مش كلود بس.
  والوصول للحسابات «من خلال كلود بس» موجود أصلاً بالإكستنشن فى كروم بتاع المالك).

### Replica (١١ مهارة لتقليد تطبيق وإعادة بنائه — ٢٠٢٦-١١-١٨، «هنحتاجها قريب»)
مراجعة بالإيد قبل التركيب: السكربتات (`sweep.py` · `contrast.py` · `parity.py` · `imgdiff.py` · `reviews.py` · `listing.py`) بايثون
standard library بس — مفيش نت ولا subprocess ولا قراية env/أسرار، وبتقرا/تكتب ملفات المشروع اللى بتتدّيلها بس. ملفات الـSKILL.md
مافيهاش أوامر مخفية؛ وهى نفسها بتشترط: كود وأصول ونصوص جديدة (مش نسخ من التطبيق الأصلى) · المستخدم بيكتب كلمات السر والمفاتيح
بنفسه · APIs رسمية بس · مفيش تخطّى تسجيل دخول لحساب مش بتاعه. اتنسخت المهارات بس (من غير `tests/` و`.claude-plugin/`).
⚠️ فوقها قواعد `CLAUDE.md`: فرع واحد للرفع · ممنوع لمس الأسرار/الدومين/إعدادات النشر من غير المالك (فـ`replica-deploy` بيقف عند
الخطوات دى ويسأل) · وشغل السيو/الجيو/أدسنس بيتراجع بشروطه قبل أى صفحة لاندنج من `replica-launch`.

