import WidgetKit
import SwiftUI

private let appGroup = "group.com.darwinmonti.easycompta"

// MARK: - Data model

struct WidgetEntry: TimelineEntry {
  let date: Date
  let income: Double
  let expense: Double
  let currency: String

  var balance: Double { income - expense }
}

// MARK: - Timeline provider

struct EasyComptaProvider: TimelineProvider {
  func placeholder(in context: Context) -> WidgetEntry {
    WidgetEntry(date: Date(), income: 3200, expense: 1840, currency: "CHF")
  }

  func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
    let entry = loadEntry()
    let refresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(refresh)))
  }

  private func loadEntry() -> WidgetEntry {
    let d = UserDefaults(suiteName: appGroup)
    return WidgetEntry(
      date:     Date(),
      income:   d?.double(forKey: "widget_income")   ?? 0,
      expense:  d?.double(forKey: "widget_expense")  ?? 0,
      currency: d?.string(forKey: "widget_currency") ?? "CHF"
    )
  }
}

// MARK: - Views

struct WidgetView: View {
  var entry: WidgetEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .systemSmall:  SmallView(entry: entry)
    default:            MediumView(entry: entry)
    }
  }
}

struct SmallView: View {
  let entry: WidgetEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Label("EasyCompta", systemImage: "chart.bar.fill")
        .font(.caption2)
        .foregroundColor(.secondary)
      Spacer()
      Text(fmt(entry.balance, currency: entry.currency, sign: true))
        .font(.title2).bold()
        .foregroundColor(entry.balance >= 0 ? .green : .red)
        .minimumScaleFactor(0.7)
      Text("Ce mois")
        .font(.caption2)
        .foregroundColor(.secondary)
    }
    .padding()
    .containerBackground(Color(UIColor.systemBackground), for: .widget)
  }
}

struct MediumView: View {
  let entry: WidgetEntry

  var body: some View {
    HStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 6) {
        Label("EasyCompta", systemImage: "chart.bar.fill")
          .font(.caption2)
          .foregroundColor(.secondary)
        Spacer()
        Text("Solde mensuel")
          .font(.caption2)
          .foregroundColor(.secondary)
        Text(fmt(entry.balance, currency: entry.currency, sign: true))
          .font(.title).bold()
          .foregroundColor(entry.balance >= 0 ? .green : .red)
          .minimumScaleFactor(0.6)
      }
      .padding()

      Divider().padding(.vertical, 12)

      VStack(spacing: 12) {
        statRow(icon: "arrow.down.circle.fill", color: .green,
                label: "Revenus", value: fmt(entry.income, currency: entry.currency))
        statRow(icon: "arrow.up.circle.fill",  color: .red,
                label: "Dépenses", value: fmt(entry.expense, currency: entry.currency))
      }
      .padding()
    }
    .containerBackground(Color(UIColor.systemBackground), for: .widget)
  }

  func statRow(icon: String, color: Color, label: String, value: String) -> some View {
    HStack {
      Image(systemName: icon).foregroundColor(color).font(.caption)
      VStack(alignment: .leading, spacing: 1) {
        Text(label).font(.caption2).foregroundColor(.secondary)
        Text(value).font(.caption).bold()
      }
    }
  }
}

private func fmt(_ amount: Double, currency: String, sign: Bool = false) -> String {
  let s = sign && amount > 0 ? "+" : (amount < 0 ? "-" : "")
  return "\(s)\(Int(abs(amount))) \(currency)"
}

// MARK: - Widget declaration

@main
struct EasyComptaWidget: Widget {
  let kind = "EasyComptaWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: EasyComptaProvider()) { entry in
      WidgetView(entry: entry)
    }
    .configurationDisplayName("EasyCompta")
    .description("Solde du mois en cours")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
