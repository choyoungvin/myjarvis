ObjC.import('EventKit');
var store = $.EKEventStore.alloc.init;
var done = false;
var result = [];
var args = $.NSProcessInfo.processInfo.arguments;
var type = args.count > 3 ? args.objectAtIndex(3).js : "";

if (type === "calendar") {
    store.requestAccessToEntityTypeCompletion(0, function(granted, error) {
        if (granted) {
            var calendars = store.calendarsForEntityType(0);
            var cal = $.NSCalendar.currentCalendar;
            var startOfDay = cal.startOfDayForDate($.NSDate.date);
            var comps = $.NSDateComponents.alloc.init;
            comps.day = 1;
            var endOfDay = cal.dateByAddingComponentsToDateOptions(comps, startOfDay, 0);
            var predicate = store.predicateForEventsWithStartDateEndDateCalendars(startOfDay, endOfDay, calendars);
            var events = store.eventsMatchingPredicate(predicate);
            var f = $.NSDateFormatter.alloc.init;
            f.dateFormat = "HH:mm";
            for (var i = 0; i < events.count; i++) {
                var e = events.objectAtIndex(i);
                result.push({
                    title: e.title.js || "",
                    start: f.stringFromDate(e.startDate).js || "",
                    end: f.stringFromDate(e.endDate).js || ""
                });
            }
        }
        done = true;
    });
} else if (type === "reminders") {
    store.requestAccessToEntityTypeCompletion(1, function(granted, error) {
        if (granted) {
            var predicate = store.predicateForIncompleteRemindersWithDueDateStartingEndingCalendars(null, null, null);
            store.fetchRemindersMatchingPredicateCompletion(predicate, function(reminders) {
                if (reminders) {
                    for (var i = 0; i < reminders.count; i++) {
                        var r = reminders.objectAtIndex(i);
                        result.push({
                            name: r.title.js || "",
                            due: "none"
                        });
                    }
                }
                done = true;
            });
        } else {
            done = true;
        }
    });
} else {
    done = true;
}

while(!done) { $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1)); }
JSON.stringify(result);
