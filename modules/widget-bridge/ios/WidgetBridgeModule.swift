import ExpoModulesCore
import WidgetKit

public class WidgetBridgeModule: Module {
  private let appGroup = "group.com.darwinmonti.easycompta"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("updateWidget") { (income: Double, expense: Double, currency: String) in
      guard let defaults = UserDefaults(suiteName: self.appGroup) else { return }
      defaults.set(income,   forKey: "widget_income")
      defaults.set(expense,  forKey: "widget_expense")
      defaults.set(currency, forKey: "widget_currency")
      defaults.synchronize()

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: "EasyComptaWidget")
      }
    }
  }
}
