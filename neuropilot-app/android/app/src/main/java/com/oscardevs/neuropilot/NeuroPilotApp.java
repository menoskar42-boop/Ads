package com.oscardevs.neuropilot;

import android.app.Application;

/**
 * Nothing to do at startup on purpose.
 *
 * Re-registering fences here would run on every cold launch, including launches
 * that happen because the OS restarted the process for its own reasons. The
 * boot receiver already covers the only case that needs it, and doing work in
 * Application.onCreate is how an app becomes slow to open.
 */
public class NeuroPilotApp extends Application {
}
