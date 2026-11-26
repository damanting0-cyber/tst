package com.caralert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 사용자가 현황 알림을 밀어서 지우면 바로 다시 띄움 (사실상 못 지우는 알림) */
class RepostReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        CarNotificationListener.postStatus(ctx, Store(ctx))
    }
}
