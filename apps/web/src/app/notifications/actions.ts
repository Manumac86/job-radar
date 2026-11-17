"use server";

import { markNotificationsRead, markNotificationUnread } from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function markRead(ids: number[] | "all") {
  markNotificationsRead(db(), ids);
  revalidatePath("/", "layout");
}

export async function markUnread(id: number) {
  markNotificationUnread(db(), id);
  revalidatePath("/", "layout");
}
