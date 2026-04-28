import EventKit
import Foundation

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
let args = CommandLine.arguments

guard args.count > 1 else { exit(1) }
let type = args[1]

if type == "calendar" {
    store.requestAccess(to: .event) { (granted, error) in
        if granted {
            let calendars = store.calendars(for: .event)
            let now = Date()
            let endOfDay = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: now)!
            let predicate = store.predicateForEvents(withStart: now, end: endOfDay, calendars: calendars)
            let events = store.events(matching: predicate)
            var out = [[String: String]]()
            let f = DateFormatter(); f.dateFormat="HH:mm"
            for e in events {
                out.append(["title": e.title ?? "", "start": f.string(from: e.startDate), "end": f.string(from: e.endDate)])
            }
            if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
        }
        semaphore.signal()
    }
} else if type == "reminders" {
    store.requestAccess(to: .reminder) { (granted, error) in
        if granted {
            let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
            store.fetchReminders(matching: predicate) { reminders in
                var out = [[String: String]]()
                for r in reminders ?? [] {
                    out.append(["name": r.title ?? "", "due": "none"])
                }
                if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
                semaphore.signal()
            }
        } else { semaphore.signal() }
    }
}
semaphore.wait()
