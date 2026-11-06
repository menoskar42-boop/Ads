# Oscar Drive — مواصفات الإضافات الجديدة (من المالك ٢٠٢٦-١١-٠٦)

> المالك بعتها ٢٠٢٦-١١-٠٦ (فترة التأجيل) ⇒ بند ١٦ فى `docs/DEFERRED_TASKS.md`. دى **إضافة** على
> `docs/OSCAR_DRIVE_V1_SPEC.md` (بند ٥) — المراجعة والخطة بتغطّى الاتنين مع بعض.
> **المطلوب أول ما التنفيذ يبدأ: مراجعة المشروع + خطة (إيه موجود ويتعاد استخدامه، إيه ناقص، إيه بيتداخل مع المواصفات الأولى) ومن غير أى تعديل فى ملفات التطبيق، وبعدين مستنى موافقة المالك.**
> النص تحت منقول بالحرف من رسالة المالك.

---

```
IMPORTANT CONSTRAINTS:

* Never rewrite entire existing files
* Always use str_replace for edits to existing files
* Add new features one at a time
* For files over 200 lines: insert code sections only,
    never full file replacement
* If a task is complex, break it into steps and
    confirm after each step

OSCAR DRIVE

NEW FEATURES & ENHANCEMENTS

ADDITIONAL DEVELOPMENT PROMPT

You are working on an existing project called Oscar Drive & Oscar Security.

IMPORTANT CONTEXT:

I have already provided a previous master prompt containing the original features and requirements.

This prompt contains NEW FEATURES ONLY.

Your task is to integrate these new requirements into the existing project without duplicating, rebuilding, or breaking previously implemented functionality.

Do not restart the project.
Do not replace existing architecture.
Do not reimplement features that already exist.

Reuse existing components, services, database structures, APIs, and UI wherever possible.

The application runs on an Android car head unit with 4GB RAM. Performance, low resource consumption, and stability are essential.

Prioritize native Android capabilities and local processing.

Avoid unnecessary AI APIs, subscriptions, external services, and additional infrastructure.

==================================================

1. OSCAR PARKING MEMORY & FIND MY CAR
    ==================================================

Develop an improved parking memory system.

MAIN REQUIREMENT:

Whenever the car screen is about to shut down, Oscar should save the latest available GPS location.

Save:

* Latitude and longitude.
* GPS accuracy in meters.
* Timestamp.
* Last known vehicle odometer reading.
* Location recording status.

The saved parking location must remain available even after the head unit loses power.

MOBILE APP INTEGRATION:

Integrate the parking location with the existing Oscar mobile application if available.

The user must be able to:

* Open the mobile application.
* View the last known parking location.
* See when the location was recorded.
* See the estimated GPS accuracy.
* Calculate the walking distance to the vehicle.
* Open Google Maps directly in Walking Navigation mode.
* Navigate back to the parked vehicle.

VOICE COMMANDS:

“Where is my car?”
“يا أوسكار، عربيتي فين؟”
“Take me to my car.”
“وصلني للعربية.”

PARKING HISTORY:

Allow the user to retain previous parking locations.

Provide a simple history list with:

* Date and time.
* Location.
* Open in Google Maps.
* Delete location.

IMPORTANT:

The head unit loses power when the vehicle is turned off.

Never claim that live tracking is available while the screen is powered off.

Always distinguish the last known location from a live location.

If GPS accuracy is poor, clearly indicate that the location is approximate.

Use existing synchronization infrastructure whenever possible.

Do not introduce expensive continuous cloud tracking.

==================================================
2. OSCAR VEHICLE MAINTENANCE MANAGER

Develop a SIMPLE vehicle maintenance reminder system.

Do not create a complicated workshop management application.

The goal is to let the user register maintenance activities quickly using voice commands.

SUPPORTED ITEMS:

* Engine oil.
* Oil filter.
* Air filter.
* Fuel filter.
* Tires.
* Battery.
* Other user-defined maintenance items.

A. DEFAULT MAINTENANCE INTERVALS

Provide reasonable default maintenance intervals where reliable vehicle-specific information is available.

Defaults must be configurable.

Do not invent manufacturer specifications.

Where vehicle-specific information is unavailable, provide editable generic defaults and clearly identify them as estimates.

Each maintenance item should support:

* Distance-based interval.
* Time-based interval.
* Both distance and time.
* User-defined notification threshold.

The system must trigger a reminder when either configured limit is reached.

Example:

Engine oil:

* Distance interval: 3,000 km or 5,000 km, selected by the user.
* Default time interval: 6 months.
* The user can change the time interval to 12 months or another value.

The user must be able to edit all intervals.

B. OIL CHANGE REGISTRATION

Example voice command:

“يا أوسكار، غيرت الزيت.”

Oscar should ask only for missing essential information:

* Current odometer reading, if unavailable.
* Selected oil interval.
* Date of replacement.

The user can specify:

“غيرت زيت 3000 كيلو.”

or:

“غيرت زيت 5000 كيلو.”

Save the replacement date and odometer reading.

Calculate the next reminder using the configured distance and time limits.

C. TIRE REPLACEMENT TRACKING

This feature is particularly important.

The user must be able to register:

* All four tires replaced.
* Two front tires replaced.
* Two rear tires replaced.
* Individual tire replacement.

Maintain separate replacement history for front and rear tires.

Do not assume that all four tires were replaced when the user replaced only two.

Example commands:

“يا أوسكار غيرت الأربع فرد.”

“غيرت الكاوتش الأمامي.”

“غيرت الفردتين اللي ورا.”

Track the replacement date and odometer reading for each axle or individual tire as appropriate.

D. FILTER AND BATTERY TRACKING

Allow separate replacement records for each item.

Use configurable distance and time intervals.

Do not automatically reset unrelated maintenance records.

E. WARRANTY MODE

Ask the user whether the vehicle is still under manufacturer warranty when setting up vehicle maintenance.

If the vehicle is under warranty:

* Allow registration of manufacturer service milestones.
* Support service intervals such as 1,000 km and 10,000 km when applicable.
* Let the user mark each scheduled service as completed.
* Track the next scheduled service.

Do not assume that all manufacturers use the same service schedule.

Allow users to enter or edit the actual warranty schedule.

If the vehicle is not under warranty:

Do not force manufacturer service milestones.

Use the user’s own maintenance intervals and reminders.

F. SIMPLE REMINDERS

Allow general reminders that are not necessarily maintenance-related.

Examples:

“Remind me when I get home to do something.”

“فكرني لما أوصل البيت أعمل كذا.”

Support:

* Time-based reminders.
* Location-based reminders.
* Saved-place reminders.

Keep the implementation lightweight.

==================================================
3. OSCAR SMART ODOMETER

Integrate the existing GPS distance calculation with maintenance and fuel management.

The application should continue calculating approximate distance while running in the background.

Requirements:

* Use the existing GPS distance calculation.
* Avoid duplicate GPS tracking services.
* Continue tracking when another application is open.
* Use efficient location update intervals.
* Persist distance records locally.
* Restore tracking after application restart where supported.

IMPORTANT DISTINCTION:

GPS-calculated distance is approximate.

The actual vehicle odometer is the reference value for maintenance records.

A. MANUAL ODOMETER CALIBRATION

Allow the user to correct the calculated odometer.

Example:

Oscar currently calculates:
98,900 km.

The actual dashboard odometer shows:
90,000 km.

The user can enter:

“Set my odometer to 90,000 km.”

Oscar must:

1. Save the manually entered odometer.
2. Record the calibration date.
3. Preserve the previous GPS calculation.
4. Use the manually corrected value as the new reference.
5. Continue adding future GPS-calculated distance.

Keep separate values for:

* GPS-calculated distance.
* User-calibrated odometer.
* Last calibration timestamp.

Never silently overwrite the user’s corrected odometer.

Never fabricate missing distance when GPS tracking was unavailable.

Clearly distinguish estimated distance from actual odometer readings.

Use the corrected odometer as the primary reference for maintenance and fuel calculations.

==================================================
4. OSCAR FUEL INTELLIGENCE

Extend the existing fuel management functionality.

The main objective is to calculate actual fuel consumption using the user’s refueling records.

A. FUEL PRICE TABLE

Provide editable prices for:

* Gasoline 80.
* Gasoline 92.
* Gasoline 95.

Prices must be editable by the user.

Maintain historical fuel prices so previous transactions retain their original costs.

Do not automatically modify historical transactions when prices change.

B. REFUELING BY MONEY OR LITERS

Users usually remember how much money they paid rather than the exact number of liters.

Support both methods.

Example:

“يا أوسكار، حطيت بنزين 92 بـ500 جنيه.”

Oscar should:

1. Identify gasoline type.
2. Retrieve the applicable historical price.
3. Calculate the estimated liters.
4. Save the amount paid.
5. Save the calculated liters.
6. Save the date and odometer reading.

Formula:

Liters = Amount Paid / Price Per Liter

Also support direct registration by liters.

Example:

“I added 25 liters of gasoline 95.”

C. FULL TANK AND PARTIAL REFUELING

Allow the user to specify:

* Full tank.
* Partial refueling.

Do not assume that every refueling operation means a full tank.

Use full-tank-to-full-tank calculations for reliable consumption measurements.

For partial refueling, accumulate the quantities until a reliable full-tank measurement becomes available.

Do not report inaccurate actual fuel consumption when insufficient data exists.

D. REAL FUEL CONSUMPTION

Calculate:

* Average liters per 100 km.
* Average consumption over recent trips.
* Historical consumption.
* Fuel cost per kilometer.

Use actual refueling records and calibrated odometer readings.

E. ESTIMATED REMAINING FUEL

Estimate remaining fuel using:

* Last confirmed tank level.
* Registered refueling quantities.
* Calculated consumption.
* GPS-calculated distance.

Clearly label the result as an estimate.

Do not present estimated fuel quantity as an actual sensor measurement.

If the available information is insufficient, ask the user to update the fuel status.

F. TRIP FUEL ESTIMATION

Before starting navigation, Oscar should calculate:

* Estimated route distance.
* Estimated fuel consumption.
* Estimated fuel cost.
* Estimated remaining fuel.
* Whether refueling is recommended before departure.

Use the user’s actual consumption history.

If there is not enough historical data, use an editable provisional consumption rate and clearly identify it as an estimate.

Example:

“Your trip is approximately 300 km.

Based on your average consumption of 10 liters per 100 km, you may need approximately 30 liters.

Your estimated remaining fuel is 15 liters.

Refueling is recommended before departure.”

Always explain the calculation basis.

G. ODOMETER TRANSPARENCY

Whenever providing fuel estimates, show the odometer value currently used in calculations.

Example:

“I am currently calculating using odometer reading 90,220 km.”

Allow the user to correct it.

==================================================
5. OSCAR FUEL COST INTELLIGENCE

Create fuel cost reports.

Calculate:

* Total monthly fuel spending.
* Total liters purchased.
* Estimated liters consumed.
* Average cost per kilometer.
* Average cost per 100 km.
* Fuel spending by gasoline type.
* Estimated cost of upcoming trips.

Allow the user to enter fuel transactions by money or liters.

Keep historical prices associated with each transaction.

==================================================
6. OSCAR DRIVING BEHAVIOR

Implement a lightweight driving behavior monitoring system.

Use available device sensors and GPS data.

Track:

* Sudden acceleration.
* Sudden braking.
* Excessive speeding based on user-configured limits.
* Continuous high-speed driving.
* Driving patterns that may increase fuel consumption.

Provide a simple driving score for each trip.

Generate a monthly summary.

IMPORTANT:

Do not make unsupported claims about vehicle mechanical conditions.

GPS and mobile sensors cannot reliably measure every driving behavior.

Clearly identify estimated measurements.

Avoid frequent voice interruptions.

Present feedback after the trip whenever possible.

Do not encourage unsafe driving.

==================================================
7. OSCAR REPORTS & ANALYTICS

Create a unified reporting section.

Reports must be available from:

1. Android car head unit.
2. Oscar mobile application.

Use the existing application synchronization architecture.

The user should see consistent data on both devices.

REPORT CATEGORIES:

A. Fuel Reports

* Fuel spending.
* Liters purchased.
* Estimated consumption.
* Average cost per kilometer.

B. Trip Reports

* Distance.
* Duration.
* Route.
* Estimated fuel consumption.
* Estimated fuel cost.

C. Maintenance Reports

* Oil changes.
* Tire replacements.
* Filter replacements.
* Battery replacements.
* Maintenance history.

D. Driving Behavior Reports

* Driving score.
* Sudden acceleration events.
* Sudden braking events.
* Speeding events.

E. General Vehicle Reports

* Total recorded expenses.
* Monthly comparisons.
* Historical records.

REPORT FILTERS:

* Daily.
* Weekly.
* Monthly.
* Custom date range.

Keep the head unit interface simple and suitable for driving.

Detailed charts and historical analysis should primarily be available in the mobile application.

Use local storage first and synchronize only necessary records.

==================================================
8. OSCAR UNIVERSAL VOICE CONTROL

This is a major new feature.

Oscar should control not only its own internal functionality but also other Android applications installed on the car head unit.

The head unit supports installing ordinary Android applications from Google Play.

Develop a lightweight Android application control manager.

A. OPEN APPLICATIONS

Support commands such as:

“يا أوسكار افتح يوتيوب.”

“افتح ChatGPT.”

“افتح Claude.”

“Open Google Maps.”

“Open Spotify.”

Use Android package manager and appropriate intents.

Allow users to select preferred applications when multiple applications support the same task.

B. SYSTEM CONTROLS

Support compatible commands such as:

* Increase volume.
* Decrease volume.
* Mute audio.
* Unmute audio.
* Go back.
* Return to home screen.
* Open Android settings.
* Open Bluetooth settings.
* Open Wi-Fi settings.

Respect Android permissions and security restrictions.

C. CONTROL INSIDE OTHER APPLICATIONS

Investigate available integration methods.

Use, in order of preference:

1. Official application intents.
2. Documented application deep links.
3. Supported media session controls.
4. Android accessibility functionality when necessary and explicitly authorized.

Accessibility must not be assumed to provide unrestricted control.

Do not implement hidden or unauthorized interaction.

If a feature is unsupported, explain the limitation rather than faking functionality.

D. CLOSE APPLICATIONS

Support voice commands:

“يا أوسكار اقفل ChatGPT.”

“Close YouTube.”

“Return to home.”

Expected behavior:

* Return to the launcher or home screen.
* Use supported task navigation.
* Optionally remove the application task from Recents when technically permitted.

Do not promise force-stopping other applications.

Android normally prevents ordinary applications from force-stopping unrelated applications.

==================================================
9. DIRECT CHATGPT VOICE LAUNCH

The user wants to launch ChatGPT directly into voice conversation.

Example:

“يا أوسكار افتح ChatGPT Voice.”

Investigate the official ChatGPT Android application behavior.

Check whether the application’s Start with Voice setting can be used.

If enabled, investigate whether launching ChatGPT with a suitable fresh conversation intent starts voice mode automatically.

Requirements:

* Open the official ChatGPT application.
* Avoid unnecessary intermediate screens.
* Prefer starting voice mode directly.
* Do not use unofficial APIs.
* Do not pretend a normal application launch is equivalent to starting Voice Mode.

If direct launch is not officially supported in the installed version, document the limitation and implement the closest reliable alternative.

Also investigate similar functionality for Claude.

Do not assume Claude supports the same launch mechanism.

Test both applications on the actual head unit.

==================================================
10. OSCAR YOUTUBE INTEGRATION

Integrate YouTube Data API from the beginning of this new development phase.

The user explicitly prefers a solution without a monthly subscription or mandatory prepaid payment.

A. GOOGLE CLOUD SETUP

Use YouTube Data API v3.

Before implementation:

* Verify current API quota rules.
* Verify current pricing and billing requirements.
* Do not enable paid billing automatically.
* Do not request unnecessary paid services.
* Stop and request approval if a billing account or payment method is required.

Use the default free quota whenever available.

Do not assume that quota increases are automatically approved.

B. VOICE SEARCH

Support commands:

“يا أوسكار ابحث عن…”

“Search YouTube for…”

Search for:

* Videos.
* Channels.
* Playlists.

Use the YouTube Data API search endpoint.

C. RESULT PRESENTATION

Display:

* Video title.
* Channel name.
* Thumbnail.
* Available duration information.
* Search results.

Allow selection by voice.

Example:

Oscar:
“I found three videos. Which one would you like?”

User:
“Play the first one.”

D. OFFICIAL YOUTUBE PLAYBACK

Open the selected video in the official YouTube Android application.

Do not implement unauthorized video downloading.

Do not attempt to bypass YouTube advertisements or Premium restrictions.

Do not assume that YouTube Data API itself plays videos.

The API is for searching and retrieving metadata.

Actual playback must use the official YouTube application.

E. FUTURE COMPATIBILITY

Allow the application to expand later to support:

* Favorite channels.
* Saved playlists.
* Recently searched videos.
* Voice selection of results.

Avoid unnecessary API requests.

==================================================
11. OSCAR AUTO START & ALWAYS READY

Oscar should start automatically when the Android car head unit starts.

The user should not need to manually open Oscar after every vehicle startup.

REQUIREMENTS:

* Automatic application startup after device boot.
* Restore the required background services.
* Start the wake-word detection service when permitted.
* Restore voice command readiness.
* Maintain GPS tracking when appropriate.
* Avoid duplicate services.
* Handle application crashes gracefully.
* Persist important data before shutdown.

WAKE WORD:

Default:

“يا أوسكار”
“Hey Oscar”

The user expects continuous wake-word detection while the screen is running.

IMPORTANT ANDROID COMPATIBILITY:

The actual Android version of the head unit is not yet confirmed.

The head unit is believed to run Android 10 or 11, but this must be verified.

Do not assume background microphone access works identically across Android versions.

Investigate:

* BOOT_COMPLETED receiver.
* Foreground service requirements.
* Microphone permissions.
* Android background execution limits.
* Battery optimization.
* Manufacturer-specific startup restrictions.

Use a lightweight local wake-word engine if compatible.

Do not stream microphone audio to cloud services.

Do not perform continuous full speech recognition when only wake-word detection is required.

Provide clear microphone status and privacy controls.

If the hardware or Android version prevents reliable always-on listening, document the exact limitation and the best alternative.

==================================================
12. IMPLEMENTATION AND COST CONTROL

CRITICAL DEVELOPMENT PRIORITIES:

1. Reuse existing architecture.
2. Reuse existing database and APIs.
3. Avoid creating duplicate functionality.
4. Keep the application lightweight.
5. Avoid unnecessary dependencies.
6. Avoid unnecessary cloud infrastructure.
7. Prefer local calculations and local storage.
8. Minimize GPS and network consumption.
9. Minimize Firebase synchronization.
10. Do not introduce AI APIs for fixed commands or calculations.
11. Do not introduce unnecessary background workers.
12. Preserve all existing working functionality.

Do not add expensive integrations unless explicitly approved.

Do not modify unrelated project files.

==================================================
13. DEVELOPMENT WORKFLOW

Before implementation:

1. Inspect the existing project.
2. Review the original requirements already implemented.
3. Identify reusable components.
4. Identify missing functionality.
5. Detect any overlap with these new requirements.
6. Produce a short implementation plan.

Do not rewrite existing architecture.

Implement features incrementally.

Suggested implementation order:

STAGE 1:
Oscar Smart Odometer and calibration.

STAGE 2:
Vehicle Maintenance Manager.

STAGE 3:
Fuel Intelligence and Fuel Cost calculations.

STAGE 4:
Reports and Analytics.

STAGE 5:
Parking Memory and Mobile Find My Car.

STAGE 6:
Oscar Universal Voice Control and App Manager.

STAGE 7:
Direct ChatGPT Voice launching.

STAGE 8:
YouTube Data API integration.

STAGE 9:
Oscar Auto Start and Always Ready.

STAGE 10:
Driving Behavior monitoring.

After each stage:

* List files modified.
* Explain what was implemented.
* Run relevant tests.
* Report technical limitations.
* Report any additional service or API requirements.
* Confirm before moving to the next complex stage.

Do not implement all stages in one massive operation.

==================================================
14. FINAL ACCEPTANCE CRITERIA

The new features must integrate with the existing Oscar Drive application.

The final result should provide:

* Reliable last parking location.
* Mobile walking navigation to the parked vehicle.
* Parking history.
* Configurable maintenance reminders.
* Separate front and rear tire replacement records.
* Warranty service tracking.
* GPS-based distance tracking.
* Manual odometer calibration.
* Fuel registration by money or liters.
* Full tank and partial refueling support.
* Historical fuel prices.
* Actual consumption calculations when sufficient data exists.
* Estimated remaining fuel.
* Estimated trip fuel consumption and cost.
* Driving behavior reports.
* Unified reports on the head unit and mobile.
* Voice control of other Android applications.
* Application launching and supported navigation controls.
* Direct ChatGPT Voice launch where officially supported.
* YouTube search and official application playback.
* Automatic startup and wake-word readiness where compatible.

The application must remain stable on a 4GB RAM Android car head unit.

Never fake unsupported hardware or Android functionality.

Never claim that an integration works until it has been tested.

FINAL INSTRUCTION:

This prompt extends the previous Oscar Drive master prompt.

Do not repeat or rebuild the old features.

Start by auditing the current project and identifying which new requirements can reuse existing code.

Present the implementation plan first.

Wait for approval before modifying project files.

Prioritize a professional, working, low-cost implementation over unnecessary complexity.
```
