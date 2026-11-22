# Oscar Drive & Oscar Security — مواصفات الترقية 1.0 (من المالك ٢٠٢٦-١١-٠٥)

> المالك بعتها ٢٠٢٦-١١-٠٥ وقال «خلى التنفيذ مجدول» ⇒ بند فى `docs/DEFERRED_TASKS.md` (بعد الاتنين ٩ نوفمبر ٣ العصر).
> **المطلوب أول ما التنفيذ يبدأ: STAGE 1 بس (مراجعة + خطة) ومن غير أى تعديل فى ملفات التطبيق، وبعدين مستنى موافقة المالك.**
> النص تحت منقول بالحرف من رسالة المالك.

---

```
IMPORTANT CONSTRAINTS:
- Never rewrite entire existing files
- Always use str_replace for edits to existing files
- Add new features one at a time
- For files over 200 lines: insert code sections only,
  never full file replacement
- If a task is complex, break it into steps and
  confirm after each step

PROJECT: OSCAR DRIVE & OSCAR SECURITY
VERSION: 1.0

ROLE:
Act as a senior Android engineer and software architect.

Your task is to upgrade the existing Oscar Drive project
by implementing the requested features below.

CRITICAL DEVELOPMENT RULES:

1. Inspect the existing project before making changes.
2. Never rebuild the application from scratch.
3. Preserve all existing working functionality.
4. Reuse existing components, services, APIs and libraries.
5. Avoid unnecessary dependencies.
6. Do not introduce AI APIs or paid AI services.
7. Do not introduce Redis, queues, microservices,
   or unnecessary backend infrastructure.
8. Prefer native Android functionality.
9. Store operational data locally whenever possible.
10. Minimize API requests and external service costs.
11. Do not create duplicate implementations.
12. Do not modify unrelated parts of the project.

IMPORTANT:
Do not assume that a feature is technically supported
just because it is requested.

Inspect the existing implementation and verify compatibility
before implementing hardware-dependent features.

==================================================
PHASE 1: PROJECT AUDIT
==================================================

Inspect the current project.

Identify:

- Existing Android architecture.
- Programming language and framework.
- Current navigation implementation.
- Google Navigation SDK integration.
- Existing GPS implementation.
- Existing voice recognition functionality.
- Existing wake-word implementation, if any.
- Existing Firebase integration.
- Existing local database.
- Existing security functionality.
- Existing camera integration.
- Existing mobile application architecture.

Produce a concise technical report.

Identify reusable components and missing components.

Do not rewrite existing files.

After completing the audit, present the implementation
plan and wait for approval before proceeding.

==================================================
PHASE 2: OSCAR VOICE ENGINE
==================================================

Develop a unified voice command engine.

Requirements:

- Arabic language support.
- English language support.
- Egyptian Arabic recognition where supported.
- Fixed commands without generative AI.
- Multiple phrases for each command.
- Customizable command phrases.
- Local command matching.
- Command-to-action mapping.
- Voice feedback.
- Text-to-speech fallback.

Example commands:

"يا أوسكار افتح الملاحة"
"يا أوسكار روح البيت"
"يا أوسكار سجل مطب"
"يا أوسكار دور على أقرب محطة بنزين"
"Hey Oscar, open navigation"
"Hey Oscar, go home"

Create a command manager allowing users to:

- Add phrases.
- Edit phrases.
- Delete phrases.
- Enable or disable commands.
- Assign multiple phrases to one command.
- Select Arabic or English.

WAKE WORD:

Support a configurable wake phrase.

Default:
"يا أوسكار"
"Hey Oscar"

Investigate a lightweight local wake-word solution.

Requirements:

- No cloud AI.
- Low CPU and RAM consumption.
- Clear microphone permission handling.
- Visible listening status.
- No hidden recording.

Do not assume continuous listening is supported
on the existing Android device.

Test microphone access and Android background restrictions.

==================================================
PHASE 3: OSCAR PERSONALITY ENGINE
==================================================

Create a voice personality system.

The system must support pre-generated audio files.

AI may be used ONCE during content creation
to generate voice recordings.

AI must NOT be required during application runtime.

Requirements:

- Arabic Egyptian voice recordings.
- English voice recordings.
- Male and female voice options.
- Multiple response variations.
- Editable response text.
- Replace individual recordings.
- Preview recordings.
- Enable or disable voice responses.

Organize audio files using stable event IDs.

Example:

startup
gps_ready
gps_lost
navigation_started
destination_reached
speed_warning
bump_saved
security_enabled
internet_lost
internet_restored
parking_saved
calling_contact
recording_started
recording_finished

Use locally stored MP3 or OGG files.

For dynamic responses, use local Android TTS
when a matching recording does not exist.

==================================================
PHASE 4: OSCAR SMART SEARCH
==================================================

Create a unified nearby search engine.

Use Google Places API if it is not already integrated.

Search categories:

- Gas stations.
- Pharmacies.
- Hospitals.
- Restaurants.
- Cafes.
- ATMs.
- Supermarkets.
- Parking locations.
- Car service centers.
- Churches.
- Mosques.

Example:

"يا أوسكار دورلي على أقرب محطة بنزين"

Workflow:

1. Recognize SEARCH_NEARBY command.
2. Extract the requested place category.
3. Get current GPS location.
4. Search nearby places.
5. Rank results by actual driving distance
   when route information is available.
6. Select the nearest suitable result.
7. Start navigation automatically.

DEFAULT BEHAVIOR:

Automatically navigate to the nearest result.

Add settings:

- Automatically navigate to nearest place.
- Show nearest 3 places.
- Show nearest 5 places.

Additional voice commands:

"هات المكان التاني"
"لا، دور على مكان تاني"
"وريني الاختيارات"
"اختار المحطة التالتة"

Important:

Do not repeatedly call Google APIs unnecessarily.

Use appropriate caching while respecting
Google Maps Platform storage and caching policies.

Check API pricing and existing billing configuration
before activating new services.

Do not assume Navigation SDK includes Places API.

==================================================
PHASE 5: SAVED PLACES & FREQUENT STOPS
==================================================

Create Saved Places.

Users can save locations with custom names.

Examples:

Home
Work
Gym
Church
Favorite Restaurant

Each saved location contains:

- Name.
- Latitude.
- Longitude.
- Optional description.
- Creation date.

Voice commands:

"يا أوسكار احفظ المكان ده باسم البيت"
"يا أوسكار وديني البيت"
"يا أوسكار وديني الشغل"

Start navigation automatically when a saved
destination is requested.

FREQUENT STOPS:

Detect locations where the vehicle repeatedly stops.

Suggested initial threshold:

More than two visits per week.

Show frequent locations in a dedicated list.

Do not automatically create permanent saved places.

Ask the user to approve and assign a name.

Allow:

- Save location.
- Rename location.
- Delete location.
- Start navigation.
- Open location in Google Maps.

Avoid continuous unnecessary GPS processing.

==================================================
PHASE 6: OSCAR SMART CALLING
==================================================

Implement Android contact search and calling.

Requirements:

- Read contacts with user permission.
- Arabic and English name matching.
- Support alternative contact names.
- Support user-defined aliases.
- Search multiple matching contacts.
- Handle multiple phone numbers.

Example:

"يا أوسكار اتصل بشوشو ماي لوف"

Search:

Shosho My Love
شوشو ماي لوف

If one contact is found:

Ask for confirmation according to user settings.

If multiple phone numbers exist:

Read available number labels and allow selection.

Commands:

"اتصل بأحمد"
"Call Ahmed"
"اتصل بالرقم التاني"
"اتصل بآخر رقم"

Use native Android calling functionality.

Prefer safe dialer intents unless direct calling
is explicitly supported and permitted.

Do not upload contacts to Firebase.

BLUETOOTH:

Investigate integration between the Android head unit
and the user's Android phone.

Do not assume Bluetooth contact access is automatically
available.

Verify supported Bluetooth profiles and permissions.

APPLE CARPLAY:

Do not attempt to implement Oscar as a CarPlay application.

Leave iPhone calling functionality to Siri.

Oscar's full voice calling functionality is for
the Android environment.

==================================================
PHASE 7: OSCAR WHATSAPP VOICE MESSAGING
==================================================

Implement a voice-message preparation workflow.

Example:

User:
"يا أوسكار ابعت فويس لأحمد"

Oscar:

1. Finds the contact.
2. Identifies the intended WhatsApp conversation.
3. Starts internal audio recording.
4. Waits for the user to finish.
5. Saves the recording locally.
6. Prepares the WhatsApp message.

Voice commands:

"ابدأ التسجيل"
"خلصت"
"اسمع الرسالة"
"عيد التسجيل"
"جهز الرسالة"

IMPORTANT REQUIREMENT:

The desired experience is a genuine WhatsApp Voice Note,
not merely an ordinary audio attachment.

Investigate whether the installed WhatsApp version
supports the required integration.

Test:

- Native WhatsApp sharing.
- Audio file compatibility.
- OGG/Opus format.
- Opening the intended conversation.
- Preparing the message.
- Manual Send confirmation.

Do not claim that a shared audio file automatically
becomes a native WhatsApp Voice Note.

If the native experience is not officially supported,
report the limitation.

Do not use WhatsApp API.

Do not use unofficial WhatsApp automation without
documenting its risks and obtaining approval.

Do not automatically send messages.

==================================================
PHASE 8: OSCAR SMART REMINDERS
==================================================

Create a local reminder system.

Allow reminders based on:

- Time.
- Date.
- Location.
- Saved places.

Example:

"يا أوسكار فكرني وأنا راجع البيت أجيب الطلبات"

Associate the reminder with Home.

Trigger the reminder when approaching the location.

Requirements:

- Local storage.
- Voice notifications.
- Snooze.
- Pause.
- Resume.
- Delete.
- Mark as completed.

Respect Android background location restrictions.

Do not introduce unnecessary background services.

==================================================
PHASE 9: OSCAR PARKING MEMORY
==================================================

Automatically save the last known parking location
when the vehicle shuts down.

Store:

- GPS coordinates.
- Timestamp.
- Optional parking notes.

Voice commands:

"يا أوسكار العربية فين؟"
"افتح مكان الركن"

Display the parking location on the map.

Remember:

The screen disconnects when the car is turned off.

Do not promise live tracking while the screen is powered off.

==================================================
PHASE 10: OSCAR FUEL & MAINTENANCE
==================================================

Create simple local vehicle management.

FUEL:

Record:

- Fuel quantity.
- Total cost.
- Date.
- Odometer reading.

MAINTENANCE:

Record:

- Oil changes.
- Filters.
- Tires.
- Battery.
- Maintenance dates.
- Mileage.

Support voice commands.

Examples:

"يا أوسكار فولت العربية"
"فاضل كام على تغيير الزيت؟"

Provide basic statistics.

Do not require AI or paid APIs.

==================================================
PHASE 11: OSCAR CONTEXT AWARENESS
==================================================

Create a lightweight application context manager.

Oscar should know:

- Whether navigation is active.
- Whether the vehicle is moving.
- Whether the vehicle is stationary.
- Whether a call is active.
- Whether voice recording is active.
- Whether GPS is available.
- Whether internet is available.

Use this information to prevent interruptions.

Examples:

- Do not play unnecessary greetings during calls.
- Do not interrupt an active recording.
- Prioritize safety alerts.
- Avoid repeated notifications.
- Keep spoken responses short while driving.

Use existing system information whenever possible.

Do not introduce AI-based context detection.

==================================================
PHASE 12: OSCAR SECURITY
==================================================

Preserve the existing security architecture.

Requirements:

- Current GPS location.
- Last known location.
- Local location history.
- Firebase synchronization.
- Movement detection.
- Connection status.
- Security notifications.

Internet:

The Android head unit uses the mobile phone hotspot.

The screen disconnects when the vehicle is turned off.

Therefore:

- Save the last known location locally.
- Synchronize when internet returns.
- Clearly distinguish internet loss from power loss.
- Never claim continuous theft tracking while
  the screen is powered off.

Do not introduce a separate tracking device.

==================================================
PHASE 13: REVERSE CAMERA RECORDING
==================================================

Record video ONLY while the reverse camera is active.

The camera currently installed in the vehicle
must remain the primary camera.

Before implementation:

- Identify the video input type.
- Check Android hardware compatibility.
- Check available video capture interfaces.
- Verify whether the existing camera feed
  can be accessed by the application.

Do not assume that the reverse camera feed
is accessible to ordinary Android applications.

If additional hardware is required,
report it before purchasing or implementing.

Do not interfere with the original reverse camera display.

Store recordings locally.

==================================================
PHASE 14: COST AND PERFORMANCE
==================================================

CRITICAL:

The application must remain lightweight.

Avoid:

- AI APIs during runtime.
- Unnecessary cloud services.
- Excessive GPS polling.
- Unnecessary network requests.
- Continuous database synchronization.
- Duplicate background services.
- Unnecessary dependencies.

Use local storage first.

Use Firebase only for functions that genuinely
require synchronization or remote notifications.

Minimize Google Places API requests.

Preserve the existing Google Navigation SDK integration.

==================================================
IMPLEMENTATION PROCESS
==================================================

Implement the project in controlled stages.

STAGE 1:
Audit existing architecture.

STAGE 2:
Implement Oscar Voice and command management.

STAGE 3:
Implement Personality Engine.

STAGE 4:
Implement Smart Search and Saved Places.

STAGE 5:
Implement Smart Calling.

STAGE 6:
Implement WhatsApp Voice preparation.

STAGE 7:
Implement Reminders and Parking Memory.

STAGE 8:
Implement Fuel and Maintenance.

STAGE 9:
Implement Context Awareness.

STAGE 10:
Integrate Security and hardware-dependent features.

After each stage:

1. Report files changed.
2. Explain functionality added.
3. Run relevant tests.
4. Report errors.
5. Confirm before proceeding to the next stage.

Do not implement all features in one massive change.

==================================================
FINAL ACCEPTANCE CRITERIA
==================================================

The final application must:

- Preserve existing Oscar Drive functionality.
- Support Arabic and English voice commands.
- Support configurable wake words where compatible.
- Play locally stored Oscar voice responses.
- Search nearby places.
- Navigate automatically to the nearest result.
- Support alternative search results.
- Save named locations.
- Detect frequent stops.
- Support voice calling on Android.
- Prepare WhatsApp voice messages.
- Support local reminders.
- Remember parking locations.
- Manage fuel and maintenance.
- Avoid unnecessary interruptions.
- Preserve existing security functions.
- Record reverse camera video only when compatible.
- Operate without runtime AI APIs.

IMPORTANT FINAL INSTRUCTION:

Prioritize a working, stable MVP over feature quantity.

Do not fake unsupported functionality.

If a feature requires hardware, permissions,
API activation, or external configuration,
document the requirement clearly.

Start with STAGE 1 ONLY.

Do not modify application files until the
initial audit and implementation plan are approved.
```
