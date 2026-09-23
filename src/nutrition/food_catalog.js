// القائمة الجاهزة للأطعمة — السعرات والماكروز لكل ١٠٠ جم.
//
// ── منين الأرقام ─────────────────────────────────────────────────────────
//
// من جداول USDA FoodData Central (SR Legacy)، للصنف بالحالة المكتوبة في
// اسمه: «مسلوق» غير «ني»، و«مشوي» غير «مقلي». الفرق بينهم مش تفصيلة — ١٠٠ جم
// أرز ني ٣٦٥ سعرة ومسلوق ١٣٠. عشان كده الحالة جزء من الاسم دايماً.
//
// ── اللي مش موجود هنا، وليه ──────────────────────────────────────────────
//
// · **الأكلات المركّبة اللي مالهاش مرجع** (كشري، محشي، مسقعة، شاورما): كل
//   بيت بيعملها بزيت وكميات مختلفة، وأي رقم هنا هيبقى تخمين بيتقال بثقة.
//   الأخصائي بيضيفها بأرقام وصفته هو. الموجود بس اللي ليه مرجع (طعمية، حمص
//   بالطحينة، بيتزا).
// · **المنتجات بالماركة** (واي بروتين، جبنة مثلثات، بسكويت): الرقم على العلبة
//   هو المرجع، وبيختلف من ماركة لماركة.
// · **العناصر الدقيقة**: نفس قرار micros.js — مابنشحنش جدول ليها.
//
// ── القاعدة ───────────────────────────────────────────────────────────────
//
// **كله قابل للتعديل وده نقطة بداية مش مرجع نهائي.** الأخصائي يقدر يعدّل أي
// رقم أو يأرشف أي صنف. والإضافة بتضيف الناقص بس — اللي عنده بنفس الاسم
// (حتى لو مؤرشف) مابيتلمسش، فالقائمة مابتكتبش فوق شغله أبداً.
//
// الحارس: scripts/check-food-catalog.js — بيتأكد إن كل صف سعراته متّسقة مع
// الماكروز (٤·٤·٩)، ومفيش اسم مكرّر، والأرقام جوّه سقوف فورم الأطعمة.
//
// [الاسم بالعربي, الاسم بالإنجليزي, سعرات, بروتين جم, كارب جم, دهون جم, التصنيف]
'use strict';

const CATALOG = [
  // ── نشويات وحبوب ──
  ['أرز أبيض مسلوق', 'Cooked white rice', 130, 2.7, 28, 0.3, 'grain'],
  ['أرز أبيض ني', 'Raw white rice', 365, 7.1, 80, 0.7, 'grain'],
  ['أرز بني مسلوق', 'Cooked brown rice', 112, 2.3, 23.5, 0.8, 'grain'],
  ['عيش بلدي', 'Baladi bread', 275, 9.5, 55, 1.6, 'grain'],
  ['عيش شامي أبيض', 'White pita bread', 275, 9.1, 55.7, 1.2, 'grain'],
  ['عيش شامي بر', 'Whole-wheat pita bread', 266, 9.8, 55, 2.6, 'grain'],
  ['توست أبيض', 'White toast bread', 266, 7.6, 50.6, 3.3, 'grain'],
  ['توست بر', 'Whole-wheat toast bread', 252, 12.4, 42.7, 3.5, 'grain'],
  ['مكرونة مسلوقة', 'Cooked pasta', 158, 5.8, 31, 0.9, 'grain'],
  ['مكرونة ني', 'Dry pasta', 371, 13, 74.7, 1.5, 'grain'],
  ['مكرونة بر مسلوقة', 'Cooked whole-wheat pasta', 124, 5.3, 26.5, 0.5, 'grain'],
  ['شوفان ني', 'Rolled oats (dry)', 389, 16.9, 66.3, 6.9, 'grain'],
  ['شوفان مطبوخ بالمية', 'Oatmeal cooked in water', 71, 2.5, 12, 1.5, 'grain'],
  ['كورن فليكس', 'Corn flakes', 357, 7.5, 84, 0.4, 'grain'],
  ['برغل مطبوخ', 'Cooked bulgur', 83, 3.1, 18.6, 0.2, 'grain'],
  ['برغل ني', 'Raw bulgur', 342, 12.3, 75.9, 1.3, 'grain'],
  ['كسكسي مطبوخ', 'Cooked couscous', 112, 3.8, 23.2, 0.2, 'grain'],
  ['كينوا مطبوخة', 'Cooked quinoa', 120, 4.4, 21.3, 1.9, 'grain'],
  ['دقيق أبيض', 'White flour', 364, 10.3, 76.3, 1, 'grain'],
  ['دقيق بر', 'Whole-wheat flour', 340, 13.2, 72, 2.5, 'grain'],
  ['ذرة سكري مسلوقة', 'Boiled sweet corn', 96, 3.4, 21, 1.5, 'grain'],
  ['فشار من غير زيت', 'Air-popped popcorn', 387, 13, 78, 4.5, 'grain'],
  ['رايس كيك', 'Plain rice cakes', 387, 8.2, 81.5, 2.8, 'grain'],

  // ── بقوليات ──
  ['فول مدمس', 'Ful medames', 110, 7.6, 19, 0.5, 'legume'],
  ['عدس مطبوخ', 'Cooked lentils', 116, 9, 20, 0.4, 'legume'],
  ['عدس ني', 'Raw lentils', 352, 24.6, 63.4, 1.1, 'legume'],
  ['حمص مسلوق', 'Boiled chickpeas', 164, 8.9, 27.4, 2.6, 'legume'],
  ['حمص ني', 'Raw chickpeas', 378, 20.5, 63, 6, 'legume'],
  ['فاصوليا بيضا مسلوقة', 'Boiled white beans', 139, 9.7, 25.1, 0.4, 'legume'],
  ['فاصوليا حمرا مسلوقة', 'Boiled kidney beans', 127, 8.7, 22.8, 0.5, 'legume'],
  ['لوبيا مسلوقة', 'Boiled black-eyed peas', 116, 7.7, 20.8, 0.5, 'legume'],
  ['ترمس مسلوق', 'Boiled lupini beans', 119, 15.6, 9.9, 2.9, 'legume'],
  ['فول صويا مسلوق', 'Boiled soybeans', 172, 18.2, 8.4, 9, 'legume'],

  // ── بروتين ──
  ['فراخ صدور مشوية', 'Grilled chicken breast', 165, 31, 0, 3.6, 'protein'],
  ['فراخ صدور ني', 'Raw chicken breast', 120, 22.5, 0, 2.6, 'protein'],
  ['وراك فراخ مشوية من غير جلد', 'Roasted chicken thigh, skinless', 209, 26, 0, 10.9, 'protein'],
  ['فراخ مشوية بالجلد', 'Roasted chicken with skin', 239, 27.3, 0, 13.6, 'protein'],
  ['كبدة فراخ مطبوخة', 'Cooked chicken liver', 167, 24.5, 0.9, 6.5, 'protein'],
  ['صدور رومي مشوية', 'Roasted turkey breast', 147, 30.1, 0, 2.1, 'protein'],
  ['لحمة بقري قليلة الدهن', 'Lean beef', 187, 26, 0, 9, 'protein'],
  ['لحمة مفرومة ٨٥٪ مشوية', 'Broiled ground beef 85% lean', 250, 25.9, 0, 15.4, 'protein'],
  ['لحمة ضاني مشوية', 'Roasted lamb leg', 258, 25.6, 0, 16.5, 'protein'],
  ['كبدة بقري مطبوخة', 'Cooked beef liver', 191, 29.1, 5.1, 5.3, 'protein'],
  ['سمك بلطي', 'Tilapia', 128, 26, 0, 2.7, 'protein'],
  ['سمك بوري مشوي', 'Grilled mullet', 150, 24.8, 0, 4.9, 'protein'],
  ['سلمون مشوي', 'Cooked salmon', 206, 22.1, 0, 12.4, 'protein'],
  ['سردين معلّب بالزيت مصفّى', 'Canned sardines in oil, drained', 208, 24.6, 0, 11.5, 'protein'],
  ['جمبري مسلوق', 'Boiled shrimp', 99, 20.9, 0.2, 1.1, 'protein'],
  ['كابوريا مسلوقة', 'Boiled crab', 83, 17.9, 0, 0.7, 'protein'],
  ['سبيط ني', 'Raw squid', 92, 15.6, 3.1, 1.4, 'protein'],
  ['تونة في المية', 'Tuna in water', 116, 26, 0, 0.8, 'protein'],
  ['تونة بالزيت مصفّاة', 'Tuna in oil, drained', 198, 29.1, 0, 8.2, 'protein'],
  ['بيض مسلوق', 'Boiled egg', 155, 13, 1.1, 11, 'protein'],
  ['بيض ني', 'Raw whole egg', 143, 12.6, 0.7, 9.5, 'protein'],
  ['بيض مقلي', 'Fried egg', 196, 13.6, 0.8, 14.8, 'protein'],
  ['بياض بيض', 'Egg white', 52, 10.9, 0.7, 0.2, 'protein'],
  ['صفار بيض', 'Egg yolk', 322, 15.9, 3.6, 26.5, 'protein'],

  // ── ألبان ──
  ['جبنة قريش', 'Cottage cheese', 98, 11, 3.4, 4.3, 'dairy'],
  ['جبنة موتزاريلا', 'Mozzarella', 300, 22.2, 2.2, 22.4, 'dairy'],
  ['جبنة فيتا', 'Feta cheese', 264, 14.2, 4.1, 21.3, 'dairy'],
  ['جبنة شيدر', 'Cheddar cheese', 403, 24.9, 1.3, 33.1, 'dairy'],
  ['جبنة بارميزان', 'Parmesan', 392, 35.8, 3.2, 25.8, 'dairy'],
  ['جبنة كريمي', 'Cream cheese', 342, 5.9, 4.1, 34.2, 'dairy'],
  ['زبادي كامل الدسم', 'Whole milk yoghurt', 61, 3.5, 4.7, 3.3, 'dairy'],
  ['زبادي قليل الدسم', 'Low-fat yoghurt', 63, 5.3, 7, 1.6, 'dairy'],
  ['زبادي يوناني خالي الدسم', 'Non-fat Greek yoghurt', 59, 10.2, 3.6, 0.4, 'dairy'],
  ['زبادي يوناني كامل الدسم', 'Whole-milk Greek yoghurt', 97, 9, 4, 5, 'dairy'],
  ['لبن كامل الدسم', 'Whole milk', 61, 3.2, 4.8, 3.3, 'dairy'],
  ['لبن نص دسم', 'Reduced-fat milk (2%)', 50, 3.3, 4.8, 2, 'dairy'],
  ['لبن خالي الدسم', 'Skim milk', 34, 3.4, 5, 0.1, 'dairy'],
  ['لبن رايب', 'Cultured buttermilk', 40, 3.3, 4.8, 0.9, 'dairy'],
  ['لبن بودرة كامل الدسم', 'Whole milk powder', 496, 26.3, 38.4, 26.7, 'dairy'],
  ['قشطة', 'Heavy cream', 340, 2.8, 2.7, 36, 'dairy'],

  // ── فاكهة ──
  ['موز', 'Banana', 89, 1.1, 23, 0.3, 'fruit'],
  ['تفاح', 'Apple', 52, 0.3, 14, 0.2, 'fruit'],
  ['برتقال', 'Orange', 47, 0.9, 12, 0.1, 'fruit'],
  ['بلح', 'Dates', 282, 2.5, 75, 0.4, 'fruit'],
  ['مانجو', 'Mango', 60, 0.8, 15, 0.4, 'fruit'],
  ['جوافة', 'Guava', 68, 2.6, 14.3, 1, 'fruit'],
  ['فراولة', 'Strawberries', 32, 0.7, 7.7, 0.3, 'fruit'],
  ['عنب', 'Grapes', 69, 0.7, 18.1, 0.2, 'fruit'],
  ['بطيخ', 'Watermelon', 30, 0.6, 7.6, 0.2, 'fruit'],
  ['كنتالوب', 'Cantaloupe', 34, 0.8, 8.2, 0.2, 'fruit'],
  ['رمان', 'Pomegranate', 83, 1.7, 18.7, 1.2, 'fruit'],
  ['تين طازة', 'Fresh figs', 74, 0.8, 19.2, 0.3, 'fruit'],
  ['تين مجفف', 'Dried figs', 249, 3.3, 63.9, 0.9, 'fruit'],
  ['مشمش', 'Apricot', 48, 1.4, 11.1, 0.4, 'fruit'],
  ['مشمش مجفف', 'Dried apricots', 241, 3.4, 62.6, 0.5, 'fruit'],
  ['خوخ', 'Peach', 39, 0.9, 9.5, 0.3, 'fruit'],
  ['كمترى', 'Pear', 57, 0.4, 15.2, 0.1, 'fruit'],
  ['يوسفي', 'Mandarin', 53, 0.8, 13.3, 0.3, 'fruit'],
  ['جريب فروت', 'Grapefruit', 42, 0.8, 10.7, 0.1, 'fruit'],
  ['ليمون', 'Lemon', 29, 1.1, 9.3, 0.3, 'fruit'],
  ['كيوي', 'Kiwi', 61, 1.1, 14.7, 0.5, 'fruit'],
  ['أناناس', 'Pineapple', 50, 0.5, 13.1, 0.1, 'fruit'],
  ['برقوق', 'Plum', 46, 0.7, 11.4, 0.3, 'fruit'],
  ['كريز', 'Sweet cherries', 63, 1.1, 16, 0.2, 'fruit'],
  ['توت', 'Mulberries', 43, 1.4, 9.8, 0.4, 'fruit'],
  ['كاكا', 'Persimmon', 70, 0.6, 18.6, 0.2, 'fruit'],
  ['زبيب', 'Raisins', 299, 3.1, 79.2, 0.5, 'fruit'],
  ['قراصيا', 'Prunes', 240, 2.2, 63.9, 0.4, 'fruit'],

  // ── خضار ──
  ['سلطة خضراء', 'Green salad', 20, 1.2, 3.6, 0.2, 'vegetable'],
  ['طماطم', 'Tomato', 18, 0.9, 3.9, 0.2, 'vegetable'],
  ['خيار', 'Cucumber', 15, 0.7, 3.6, 0.1, 'vegetable'],
  ['خس', 'Lettuce', 15, 1.4, 2.9, 0.2, 'vegetable'],
  ['جرجير', 'Arugula', 25, 2.6, 3.7, 0.7, 'vegetable'],
  ['بقدونس', 'Parsley', 36, 3, 6.3, 0.8, 'vegetable'],
  ['شبت', 'Dill', 43, 3.5, 7, 1.1, 'vegetable'],
  ['كزبرة خضرا', 'Fresh coriander', 23, 2.1, 3.7, 0.5, 'vegetable'],
  ['كرفس', 'Celery', 14, 0.7, 3, 0.2, 'vegetable'],
  ['فجل', 'Radish', 16, 0.7, 3.4, 0.1, 'vegetable'],
  ['جزر ني', 'Raw carrot', 41, 0.9, 9.6, 0.2, 'vegetable'],
  ['جزر مسلوق', 'Boiled carrot', 35, 0.8, 8.2, 0.2, 'vegetable'],
  ['بصل ني', 'Raw onion', 40, 1.1, 9.3, 0.1, 'vegetable'],
  ['توم', 'Garlic', 149, 6.4, 33.1, 0.5, 'vegetable'],
  ['فلفل رومي أخضر', 'Green bell pepper', 20, 0.9, 4.6, 0.2, 'vegetable'],
  ['فلفل ألوان', 'Red bell pepper', 31, 1, 6, 0.3, 'vegetable'],
  ['كوسة ني', 'Raw zucchini', 17, 1.2, 3.1, 0.3, 'vegetable'],
  ['كوسة مسلوقة', 'Boiled zucchini', 15, 1.1, 2.7, 0.4, 'vegetable'],
  ['باذنجان ني', 'Raw eggplant', 25, 1, 5.9, 0.2, 'vegetable'],
  ['باذنجان مسلوق', 'Boiled eggplant', 35, 0.8, 8.7, 0.2, 'vegetable'],
  ['كرنب ني', 'Raw cabbage', 25, 1.3, 5.8, 0.1, 'vegetable'],
  ['قرنبيط مسلوق', 'Boiled cauliflower', 23, 1.8, 4.1, 0.5, 'vegetable'],
  ['بروكلي مسلوق', 'Boiled broccoli', 35, 2.4, 7.2, 0.4, 'vegetable'],
  ['سبانخ ني', 'Raw spinach', 23, 2.9, 3.6, 0.4, 'vegetable'],
  ['سبانخ مسلوقة', 'Boiled spinach', 23, 3, 3.8, 0.3, 'vegetable'],
  ['ملوخية ورق ني', 'Raw jute leaves (molokhia)', 34, 4.7, 5.8, 0.3, 'vegetable'],
  ['ملوخية مطبوخة من غير سمنة', 'Boiled jute leaves, no fat', 37, 3.7, 7.3, 0.2, 'vegetable'],
  ['بامية مسلوقة', 'Boiled okra', 22, 1.9, 4.5, 0.2, 'vegetable'],
  ['فاصوليا خضرا مسلوقة', 'Boiled green beans', 35, 1.9, 7.9, 0.3, 'vegetable'],
  ['بسلة مسلوقة', 'Boiled green peas', 84, 5.4, 15.6, 0.2, 'vegetable'],
  ['خضار مشكّل مسلوق', 'Boiled mixed vegetables', 65, 2.9, 13.1, 0.2, 'vegetable'],
  ['بنجر مسلوق', 'Boiled beetroot', 44, 1.7, 10, 0.2, 'vegetable'],
  ['لفت مسلوق', 'Boiled turnip', 22, 0.7, 5.1, 0.1, 'vegetable'],
  ['خرشوف مسلوق', 'Boiled artichoke', 53, 2.9, 11.9, 0.3, 'vegetable'],
  ['قلقاس مسلوق', 'Boiled taro', 142, 0.5, 34.6, 0.1, 'vegetable'],
  ['مشروم', 'Mushrooms', 22, 3.1, 3.3, 0.3, 'vegetable'],
  ['بطاطس مسلوقة', 'Boiled potato', 87, 1.9, 20, 0.1, 'vegetable'],
  ['بطاطس مشوية بالقشر', 'Baked potato with skin', 93, 2.5, 21.2, 0.1, 'vegetable'],
  ['بطاطس محمّرة', 'French fries', 312, 3.4, 41.4, 14.7, 'vegetable'],
  ['بطاطا مشوية', 'Baked sweet potato', 90, 2, 20.7, 0.2, 'vegetable'],
  ['صلصة طماطم مركّزة', 'Tomato paste', 82, 4.3, 18.9, 0.5, 'vegetable'],
  ['زيتون أسود', 'Black olives', 115, 0.8, 6.3, 10.7, 'vegetable'],
  ['زيتون أخضر', 'Green olives', 145, 1, 3.8, 15.3, 'vegetable'],

  // ── دهون ومكسرات وبذور ──
  ['زيت زيتون', 'Olive oil', 884, 0, 0, 100, 'fat'],
  ['زيت عباد الشمس', 'Sunflower oil', 884, 0, 0, 100, 'fat'],
  ['سمنة بلدي', 'Ghee', 876, 0.3, 0, 99.5, 'fat'],
  ['زبدة', 'Butter', 717, 0.9, 0.1, 81.1, 'fat'],
  ['مايونيز', 'Mayonnaise', 680, 1, 0.6, 74.9, 'fat'],
  ['طحينة', 'Tahini', 595, 17, 21, 54, 'fat'],
  ['مكسرات نيّة', 'Raw mixed nuts', 607, 20, 21, 54, 'fat'],
  ['لوز ني', 'Raw almonds', 579, 21.2, 21.6, 49.9, 'fat'],
  ['عين جمل', 'Walnuts', 654, 15.2, 13.7, 65.2, 'fat'],
  ['كاجو ني', 'Raw cashews', 553, 18.2, 30.2, 43.9, 'fat'],
  ['فستق ني', 'Raw pistachios', 560, 20.2, 27.2, 45.3, 'fat'],
  ['بندق', 'Hazelnuts', 628, 15, 16.7, 60.8, 'fat'],
  ['فول سوداني محمّص', 'Dry-roasted peanuts', 585, 23.7, 21.5, 49.7, 'fat'],
  ['زبدة فول سوداني', 'Peanut butter', 588, 25.1, 20, 50.4, 'fat'],
  ['لب أبيض', 'Pumpkin seeds', 559, 30.2, 10.7, 49, 'fat'],
  ['لب سوري', 'Sunflower seeds', 584, 20.8, 20, 51.5, 'fat'],
  ['بذور شيا', 'Chia seeds', 486, 16.5, 42.1, 30.7, 'fat'],
  ['بذر كتان', 'Flaxseed', 534, 18.3, 28.9, 42.2, 'fat'],
  ['سمسم', 'Sesame seeds', 573, 17.7, 23.4, 49.7, 'fat'],
  ['جوز هند مبشور', 'Desiccated coconut, unsweetened', 660, 6.9, 23.7, 64.5, 'fat'],
  ['أفوكادو', 'Avocado', 160, 2, 8.5, 14.7, 'fat'],

  // ── سكريات وحلويات ──
  ['سكر أبيض', 'White sugar', 387, 0, 100, 0, 'sweet'],
  ['عسل نحل', 'Honey', 304, 0.3, 82.4, 0, 'sweet'],
  ['عسل أسود', 'Molasses', 290, 0, 74.7, 0.1, 'sweet'],
  ['مربى', 'Jam', 278, 0.4, 68.9, 0.1, 'sweet'],
  ['شوكولاتة باللبن', 'Milk chocolate', 535, 7.7, 59.4, 29.7, 'sweet'],
  ['شوكولاتة داكنة ٧٠–٨٥٪', 'Dark chocolate 70–85%', 598, 7.8, 45.9, 42.6, 'sweet'],
  ['آيس كريم فانيليا', 'Vanilla ice cream', 207, 3.5, 23.6, 11, 'sweet'],

  // ── مشروبات ──
  ['عصير برتقال فريش', 'Fresh orange juice', 45, 0.7, 10.4, 0.2, 'drink'],
  ['مشروب كولا', 'Cola soft drink', 37, 0.1, 9.6, 0, 'drink'],

  // ── أكلات جاهزة ليها مرجع ──
  ['طعمية', 'Falafel', 333, 13.3, 31.8, 17.8, 'dish'],
  ['حمص بالطحينة', 'Hummus', 166, 7.9, 14.3, 9.6, 'dish'],
  ['بيتزا جبنة', 'Cheese pizza', 266, 11.4, 33.3, 9.7, 'dish'],
];

const CATEGORIES = ['grain', 'legume', 'protein', 'dairy', 'fruit', 'vegetable', 'fat', 'sweet', 'drink', 'dish'];

// الاسم زي ما بيتقارن: من غير مسافات زيادة، وبحروف صغيرة للإنجليزي.
const nameKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * الأصناف اللي ناقصة من عيادة، باسم لغة العيادة.
 * «موجود» معناها إن الاسم موجود **بأي لغة** وبأي حالة (نشط أو مؤرشف):
 * الأخصائي اللي أرشف «كولا» قرّر إنها مش في قايمته — مانرجّعهاش له.
 */
function missing(existingNames, lang) {
  const have = new Set((existingNames || []).map(nameKey));
  const col = lang === 'en' ? 1 : 0;
  return CATALOG.filter((r) => !have.has(nameKey(r[0])) && !have.has(nameKey(r[1])))
    .map((r) => ({ name: r[col], kcal: r[2], protein_g: r[3], carbs_g: r[4], fat_g: r[5], category: r[6] }));
}

module.exports = { CATALOG, CATEGORIES, missing, nameKey };
