import { CalendarPlus } from "lucide-react";
import { buildIcs, googleCalendarUrl, icsFileName, outlookCalendarUrl, type CalendarItem } from "@/lib/ics";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function download(item: CalendarItem) {
  const blob = new Blob([buildIcs([item])], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = icsFileName(item.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Put one event in someone's own calendar: opens Google or Outlook with it
 * filled in, or downloads an .ics file for Apple Calendar and anything else.
 * The .ics file can also be emailed to a client.
 */
export function AddToCalendar({ item, size = "icon" }: { item: CalendarItem; size?: "icon" | "sm" }) {
  const open = (url: string) => window.open(url, "_blank", "noopener");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {size === "icon" ? (
          <Button variant="ghost" size="icon" aria-label={`Add ${item.title} to a calendar`} title="Add to calendar">
            <CalendarPlus className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm"><CalendarPlus className="mr-1.5 h-4 w-4" />Add to calendar</Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to calendar</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => open(googleCalendarUrl(item))}>Google Calendar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(outlookCalendarUrl(item, true))}>Outlook (Microsoft 365)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(outlookCalendarUrl(item, false))}>Outlook.com</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => download(item)}>Apple Calendar or other (.ics file)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
