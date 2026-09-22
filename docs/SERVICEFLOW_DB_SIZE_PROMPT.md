# برومبت: قياس حجم قاعدة Service Flow وتحديد مكان المساحة

**Trigger:** «ابعتلي برومبت قياس حجم القاعدة».

الهدف: نعرف بالظبط فين الـ١.٢ جيجا قبل أي قرار نقل. الفرضية إن صور الصيانة
مخزّنة كـ`BYTEA` في `maintenance.photos` وهي معظم الحجم — الاستعلامات دي بتأكدها
أو بتنفيها بالأرقام.

⚠️ البرومبت **قراءة فقط** عن قصد: مفيش أي تعديل، عشان يتنفّذ على قاعدة Production
من غير قلق.

---

```
راجع حجم قاعدة بيانات Service Flow وحدّد بالظبط فين المساحة مستهلكة.

🔴 خطوط حمرا — التزم بيها حرفياً:
· ده تمرين **قراءة فقط**. ممنوع أي INSERT / UPDATE / DELETE / DROP / TRUNCATE.
· ممنوع أي DDL (مفيش CREATE ولا ALTER ولا فهارس جديدة).
· ممنوع VACUUM FULL — بيقفل الجداول وده Production شغّال.
· ممنوع تغيير أي متغيّر بيئة أو Secret.
· ممنوع Publish أو Deploy.
· ممنوع تعديل أي ملف في المشروع.
· لو أي استعلام أخد أكتر من ٣٠ ثانية، أوقفه واذكر ده في التقرير.

شغّل الاستعلامات دي على قاعدة Service Flow (الرابط في SERVICEFLOW_DATABASE_URL)
وارجعلي بالناتج الخام لكل واحد:

--- ١) الحجم الكلي للقاعدة
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

--- ٢) الحجم لكل سكيمة (دي أهم واحدة — الاستعلام السابق كان على public بس)
SELECT n.nspname AS schema_name,
       pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r','m','t')
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 GROUP BY n.nspname
 ORDER BY SUM(pg_total_relation_size(c.oid)) DESC;

--- ٣) أكبر ٢٠ جدول في **كل** السكيمات (من غير WHERE على schema)
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       pg_size_pretty(pg_relation_size(c.oid))       AS table_only,
       pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid))
                                                     AS indexes_and_toast
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 ORDER BY pg_total_relation_size(c.oid) DESC
 LIMIT 20;

--- ٤) جدول الصور بالتفصيل
--- (لو اسم السكيمة مش maintenance، شوفه من نتيجة استعلام ٢ وغيّره هنا)
SELECT media_type,
       COUNT(*)                                    AS rows_count,
       COUNT(data)                                 AS rows_with_data,
       pg_size_pretty(COALESCE(SUM(length(data)),0)) AS bytes_in_data_column,
       MIN(uploaded_at)::date                      AS oldest,
       MAX(uploaded_at)::date                      AS newest
  FROM maintenance.photos
 GROUP BY media_type
 ORDER BY COALESCE(SUM(length(data)),0) DESC;

--- ٥) الصفوف الميتة (bloat) — مساحة متاخدة من غير بيانات
SELECT schemaname, relname, n_live_tup, n_dead_tup,
       last_vacuum, last_autovacuum
  FROM pg_stat_user_tables
 WHERE n_dead_tup > 1000
 ORDER BY n_dead_tup DESC
 LIMIT 15;

--- ٦) أكبر ١٠ فهارس
SELECT n.nspname AS schema_name, c.relname AS index_name,
       pg_size_pretty(pg_relation_size(c.oid)) AS size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'i'
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 ORDER BY pg_relation_size(c.oid) DESC
 LIMIT 10;

بعد ما تجمع الأرقام، اكتبلي ملخّص فيه الأربعة دول بالظبط:

١. الحجم الكلي للقاعدة.
٢. حجم جدول الصور (maintenance.photos) — وكام في المية من الحجم الكلي.
٣. حجم البيانات الفعلي جوّه عمود data، وعدد الصفوف اللي فيها data مش فاضي،
   مقسّم على media_type (صور / فيديو).
٤. لو شِلنا الصور من القاعدة، الحجم المتوقّع هيبقى كام.

وقوللي كمان لو لقيت أي جدول تاني حجمه فوق ٥٠ ميجا وأنا مش متوقّعه.

⛔ متعملش أي تنضيف ولا حذف ولا نقل. أنا عايز الأرقام بس — القرار بعد كده.
```
