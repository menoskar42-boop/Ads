# قياس تغطية OSM لمحافظة أسيوط — المرحلة A

- **التاريخ:** 2026-11-26
- **فترة الطلبات:** 10:01:15–10:11:32 UTC
- **حالة التقرير:** قياس جزئى؛ وصلت المحاولة الخامسة عشرة إلى حد الطلبات قبل اكتمال عينة الحداثة وقيم `maxspeed`.
- **مصدر البيانات:** Overpass API العام. أرجع الخادم ترخيص ODbL وإسناد OpenStreetMap.
- **حدود المحافظة:** العلاقة `3726184`، والاسم الموثق فى OSM `Asyut`، والاسم العربى `أسيوط`. استخدمت مساحة العلاقة `3603726184` فى الاستعلامات اللاحقة.
- **حدود مركز الغنايم:** لم يظهر تطابق لعلاقة حدود إدارية داخل مساحة أسيوط، لا عند `admin_level` 7 أو 8 ولا فى البحث الأوسع عن `Ghan` أو `غنايم`. لذلك لم أخمّن الحد ولم أحسب له أرقاماً.

## العدّ داخل أسيوط

استعلام الطرق أعاد **56,242** way من الأنواع التسعة المطلوبة. من بينها **26** فقط عليها `maxspeed`، أى **0.0462%** من إجمالى هذه الطرق.

| نوع الطريق (`highway`) | كل الطرق | عليها `maxspeed` | النسبة داخل النوع |
|---|---:|---:|---:|
| motorway | 44 | 0 | 0.00% |
| trunk | 348 | 6 | 1.72% |
| primary | 94 | 0 | 0.00% |
| secondary | 230 | 0 | 0.00% |
| tertiary | 419 | 0 | 0.00% |
| unclassified | 3,801 | 1 | 0.03% |
| residential | 49,383 | 18 | 0.04% |
| living_street | 84 | 1 | 1.19% |
| service | 1,839 | 0 | 0.00% |
| **الإجمالى** | **56,242** | **26** | **0.0462%** |

| الوسم | العدد |
|---|---:|
| `oneway=yes` | 1,918 |
| `oneway=-1` | 0 |
| `oneway=no` | 1 |
| `highway=traffic_signals` | 0 |
| `highway=crossing` | 37 |
| `highway=speed_camera` | 0 |
| `junction=roundabout` | 49 |
| `highway=stop` | 0 |
| `highway=give_way` | 0 |

### `traffic_calming` لكل قيمة

| القيمة | العدد |
|---|---:|
| bump | 15 |
| table | 1 |
| **الإجمالى** | **16** |

## قيم السرعة وحداثة البيانات

لم تكتمل عينة الطرق لأن طلب العينة رقم 15 رجع `502` من Overpass: كل عمّال الاستعلام كانوا مشغولين والصف ممتلئ. لذلك لا أقدّم ترتيباً لأكثر عشر قيم `maxspeed`، ولا توزيعاً لسنوات آخر تعديل، ولا عدّاً لـ`check_date` و`check_date:maxspeed`. لم أستنتج أى قيم من عينة لم تصل.

## الغنايم

استعلاما الحدود لم يعثرا على علاقة إدارية تطابق `Ghan` أو `غنايم` داخل مساحة أسيوط. النتيجة هنا تخص **عدم العثور على تطابق بالاسم والأنواع الإدارية التى بحثت عنها**، وليست إثباتاً أن المنطقة بلا حدود مرسومة بأى اسم آخر. لم تُطلب أرقام تغطية للغنايم من غير حد مؤكد.

## إيه اللى نقدر نستنتجه وإيه اللى لأ

- **نقدر نستنتج:** فى لقطة OSM وقت القياس، وسم السرعة نادر جداً على أنواع الطرق المحددة (26 من 56,242)، بينما وسم `oneway=yes` موجود على 1,918 way. ظهرت أيضاً 37 نقطة عبور و49 دواراً و16 عنصراً للتهدئة المرورية.
- **ما نقدرش نستنتج:** اكتمال التغطية على الأرض، أو صحة الوسوم، أو سرعة طريق بعينه، أو حداثة بيانات السرعة، أو مواقع الإشارات والكاميرات فعلياً. لم تكتمل عينة الحداثة، كما أن العدّ لا يقيس الأطوال ولا الدقة الميدانية.
- **التوصية:** لا تستخدم أرقام `maxspeed` الحالية لتشغيل تنبيهات السرعة. يلزم قياس جديد ناجح لعينة الحداثة وقيم السرعة، ثم تحقق ميدانى منفصل قبل أى استخدام فى القيادة.

## نصوص استعلامات Overpass بالحرف

كل الاستعلامات أدناه استخدمت `timeout:120`، ورُسلت بـ`User-Agent: OscarDrive-coverage-check` إلى `https://overpass-api.de/api/interpreter`. لم يتضمن أى استعلام إحداثيات.

### 1. البحث عن حدود أسيوط

```overpass
[out:json][timeout:120];
relation["boundary"="administrative"]["admin_level"="4"]["name:en"~"Asyut|Assiut",i];
out tags ids;
```

النتيجة: `relation 3726184` (HTTP 200). طلب قراءة الوسوم اللاحق أكد الاسم `Asyut` و`name:ar=أسيوط`.

### 2. قراءة اسم العلاقة

المحاولة الأولى:

```overpass
[out:json][timeout:120];
relation(3726184);
out tags;
```

رجعت محاولتان بهذه الصيغة HTTP 502. ثم جُرّبت الصيغة المختصرة:

```overpass
[out:json][timeout:120];
rel(3726184);
out tags;
```

رجعت محاولتان HTTP 502، ثم نجحت المحاولة الثالثة HTTP 200 وأكدت `name:en=Asyut` و`name:ar=أسيوط`.

### 3. البحث عن حد الغنايم داخل أسيوط

```overpass
[out:json][timeout:120];
area(3603726184)->.province;
relation(area.province)["boundary"="administrative"]["admin_level"~"7|8"]["name"~"Ghanayem|Ghanayim|Ghanaym",i];
out tags;
```

النتيجة: لا عناصر مطابقة، HTTP 200.

### 4. بحث أوسع عن علاقة حدود باسم الغنايم

```overpass
[out:json][timeout:120];
area(3603726184)->.province;
relation(area.province)["boundary"="administrative"]["name"~"غنايم|Ghan",i];
out tags;
```

النتيجة: لا عناصر مطابقة، HTTP 200.

### 5. إجمالى الطرق والأنواع ووجود السرعة والاتجاه

```overpass
[out:json][timeout:120];
area(3603726184)->.a;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"];
out count;
way(area.a)[highway="motorway"];
out count;
way(area.a)[highway="trunk"];
out count;
way(area.a)[highway="primary"];
out count;
way(area.a)[highway="secondary"];
out count;
way(area.a)[highway="tertiary"];
out count;
way(area.a)[highway="unclassified"];
out count;
way(area.a)[highway="residential"];
out count;
way(area.a)[highway="living_street"];
out count;
way(area.a)[highway="service"];
out count;
way(area.a)[highway="motorway"][maxspeed];
out count;
way(area.a)[highway="trunk"][maxspeed];
out count;
way(area.a)[highway="primary"][maxspeed];
out count;
way(area.a)[highway="secondary"][maxspeed];
out count;
way(area.a)[highway="tertiary"][maxspeed];
out count;
way(area.a)[highway="unclassified"][maxspeed];
out count;
way(area.a)[highway="residential"][maxspeed];
out count;
way(area.a)[highway="living_street"][maxspeed];
out count;
way(area.a)[highway="service"][maxspeed];
out count;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"][oneway="yes"];
out count;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"][oneway="-1"];
out count;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"][oneway="no"];
out count;
```

النتيجة: HTTP 200؛ `timestamp_osm_base=2026-11-26T10:05:19Z`.

### 6. عناصر الطريق والتهدئة المرورية — محاولة أولى

```overpass
[out:json][timeout:120];
area(3603726184)->.a;
node(area.a)[highway="traffic_signals"];
out count;
node(area.a)[highway="crossing"];
out count;
node(area.a)[highway="speed_camera"];
out count;
way(area.a)[junction="roundabout"];
out count;
node(area.a)[highway="stop"];
out count;
node(area.a)[highway="give_way"];
out count;
nwr(area.a)[traffic_calming];
out tags;
```

رجعت محاولتان متتاليتان HTTP 502 بسبب امتلاء صف الخادم؛ أُعيد تقسيم القياس إلى الاستعلامين التاليين.

### 7. عدّ الإشارات والعبور والكاميرات والدوارات والتوقف

```overpass
[out:json][timeout:120];
area(3603726184)->.a;
node(area.a)[highway="traffic_signals"];out count;
node(area.a)[highway="crossing"];out count;
node(area.a)[highway="speed_camera"];out count;
way(area.a)[junction="roundabout"];out count;
node(area.a)[highway="stop"];out count;
node(area.a)[highway="give_way"];out count;
```

النتيجة: HTTP 200؛ `timestamp_osm_base=2026-11-26T10:07:23Z`.

### 8. كل قيم `traffic_calming`

```overpass
[out:json][timeout:120];
area(3603726184)->.a;
nwr(area.a)[traffic_calming];
out tags;
```

النتيجة: HTTP 200؛ 16 عنصراً: 15 `bump` و1 `table`؛ `timestamp_osm_base=2026-11-26T10:08:21Z`.

### 9. عينة السرعة والاتجاه والحداثة — فشل

```overpass
[out:json][timeout:120];
area(3603726184)->.a;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"][maxspeed]->.speed;
way(area.a)[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"][oneway]->.oneway;
(.speed; .oneway;)->.sample;
.sample out meta tags 2000;
```

النتيجة: محاولتان متتاليتان HTTP 502 (الطلبان 14 و15). رد الخادم: كل عمّال الاستعلام مشغولون وصف الطلبات ممتلئ. لم أعد المحاولة بعد بلوغ الحد الأقصى المحدد للقياس.

## سجل الطلبات وقيود التنفيذ

أُرسلت 15 طلباً بالضبط، وبين الطلبات أكثر من ثانيتين. حالات HTTP بالترتيب: `200, 502, 502, 502, 502, 200, 200, 200, 200, 502, 502, 200, 200, 502, 502`. كل أخطاء 502 كانت رسالة امتلاء صف Overpass، لا أخطاء فى قاعدة بيانات أو أسرار. لم تُقرأ أى قاعدة بيانات.
