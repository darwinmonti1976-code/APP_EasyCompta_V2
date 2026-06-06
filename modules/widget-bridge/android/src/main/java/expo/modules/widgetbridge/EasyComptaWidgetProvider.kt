package expo.modules.widgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import expo.modules.widgetbridge.R

class EasyComptaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (id in appWidgetIds) refresh(context, appWidgetManager, id)
  }

  companion object {
    fun refresh(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val prefs = context.getSharedPreferences("easycompta_widget", Context.MODE_PRIVATE)
      val income   = prefs.getFloat("widget_income",   0f).toDouble()
      val expense  = prefs.getFloat("widget_expense",  0f).toDouble()
      val currency = prefs.getString("widget_currency", "CHF") ?: "CHF"
      val balance  = income - expense

      val views = RemoteViews(context.packageName, R.layout.widget_easycompta)

      val sign = if (balance >= 0) "+" else ""
      views.setTextViewText(R.id.widget_balance,  "$sign${balance.toInt()} $currency")
      views.setTextViewText(R.id.widget_income,   "+${income.toInt()}")
      views.setTextViewText(R.id.widget_expense,  "-${expense.toInt()}")

      // Tap → open app
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val pending = PendingIntent.getActivity(
        context, 0, launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.widget_root, pending)

      manager.updateAppWidget(widgetId, views)
    }
  }
}
