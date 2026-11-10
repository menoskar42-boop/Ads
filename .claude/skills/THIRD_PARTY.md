# مهارات من برّه (اتركّبت ٢٠٢٦-١١-٠٩ بطلب المالك)

اتنسخت زى ما هى (من غير تعديل) — المهارات بس، **من غير** hook بداية الجلسة بتاع Superpowers
(اللى بيضيف سياق مع كل جلسة ويزوّد الاستهلاك). كلود بيفتح أى مهارة لما الشغل يحتاجها بس.

| المصدر | النسخة | المهارات | الرخصة |
|---|---|---|---|
| github.com/obra/superpowers | 22f0b46 (2026-11-03) | brainstorming · dispatching-parallel-agents · executing-plans · finishing-a-development-branch · receiving-code-review · requesting-code-review · subagent-driven-development · systematic-debugging · test-driven-development · using-git-worktrees · verification-before-completion · writing-plans · writing-skills | MIT (`SUPERPOWERS-LICENSE.txt`) |
| github.com/forrestchang/andrej-karpathy-skills | 2c60614 (2026-04-20) | karpathy-guidelines | MIT |
| github.com/anthropics/skills | 2c5958e (2026-11-06) | mcp-builder · webapp-testing · frontend-design | Apache-2.0 (`LICENSE.txt` جوّه كل مهارة) |
| github.com/morluto/rea (REA) | 3345019 (2026-11-10، بطلب المالك) | reverse-engineer-anything | MIT (`LICENSE.txt` جوّه المهارة) |

اتسابت: `using-superpowers` و`diagnosing-superpowers` (بيشتغلوا مع الـplugin والـhook)،
وskill-creator/claude-api/docx/pdf/pptx/xlsx (موجودين أصلاً)، والباقى مالوش علاقة بشغلنا.

⚠️ قواعد `CLAUDE.md` بتتقدّم على أى مهارة — خصوصاً: الرفع على فرع واحد بس
(`claude/build-oscardevs-ads-mvp-8krfN`)، فمهارات زى using-git-worktrees وfinishing-a-development-branch
ماتعملش فروع ولا PR جديدة.

### REA: Reverse Engineer Anything (٢٠٢٦-١١-١٠)
المهارة تعليمات بس، ومش بتركّب حاجة ولا بتشغّل كود. أدوات REA نفسها (MCP + محرّكات زى Ghidra/JADX) **مش متركّبة**،
وبتتركّب وقت ما نحتاجها بأمر واحد: `npx rea-agents setup` (أو من غير تسجيل: `npx rea-agents --help`).
⚠️ للاستخدام على تطبيقات وملفات إحنا من حقنا نحلّلها (تطبيقاتنا، أو تحليل مسموح بيه)، مش لكسر حماية أو ترخيص.
