package expo.modules.widgetbridge

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WidgetBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("updateWidget") { income: Double, expense: Double, currency: String ->
      val context = appContext.reactContext ?: return@AsyncFunction

      // Persist data for the widget to read
      context.getSharedPreferences("easycompta_widget", Context.MODE_PRIVATE)
        .edit()
        .putFloat("widget_income",  income.toFloat())
        .putFloat("widget_expense", expense.toFloat())
        .putString("widget_currency", currency)
        .apply()

      // Force all instances to refresh
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(
        ComponentName(context, EasyComptaWidgetProvider::class.java)
      )
      if (ids.isNotEmpty()) {
        val intent = Intent(context, EasyComptaWidgetProvider::class.java).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(intent)
      }
    }
  }
}
