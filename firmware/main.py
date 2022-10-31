import gc
import time
import network
import rp2
import urequests as requests

from machine import Pin, PWM, Timer
from secrets import WIFI_SSID, WIFI_PASS


NAME = 'Roller%20Blinds'
PHASE_PER_SECOND = 1000
STEPS_PER_MM = 6.9
BLINDS_HEIGHT = 1050
REVERSE_DIR = False

PIN_STP = 7
PIN_DIR = 10
PIN_ENA = 15
PIN_END = 3


def wifi_connect():
    rp2.country('AU')
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(WIFI_SSID, WIFI_PASS)

    # WiFi Connection code from https://datasheets.raspberrypi.com/picow/connecting-to-the-internet-with-pico-w.pdf
    max_wait = 10
    for _ in range(max_wait):
        status = wlan.status()
        if status < 0 or status >= 3:
            break
        time.sleep(1)

    if wlan.status() != 3:
        print('wifi connection failed')
        wlan.active(False)

    ip = wlan.ifconfig()[0]
    print('WiFi connected; ip = ' + ip)
    return wlan

def push_poll(state: State):
    try:
        payload = {'current_pct': state.get_cur_percentage(), 'target_pct': state.get_tgt_percentage()}
        res = requests.post('http://192.168.1.69:44444/' + NAME, json = payload)
        rej = res.json()
        state.set_percentage(rej['target_pct'])
        return True
    except:
        print('Failed to poll HomeBridge server')
        return False

class State:
    max_steps = round(STEPS_PER_MM * BLINDS_HEIGHT)
    reverse_dir = REVERSE_DIR
    full_step_delay_ms = 1000 / PHASE_PER_SECOND
    half_step_delay_us = int(1000 * full_step_delay_ms / 2)
    steps = 0
    target_steps = 0
    endstop_initial_lock = False

    def __init__(self):
        self.pin_stp = Pin(PIN_STP, Pin.OUT)
        self.pwm_stp = PWM(self.pin_stp)
        self.pwm_stp.freq(PHASE_PER_SECOND)
        self.pwm_stp.duty_u16(1 << 15)
        
        self.pin_dir = Pin(PIN_DIR, Pin.OUT)
        self.pin_ena = Pin(PIN_ENA, Pin.OUT)
        self.pin_end = Pin(PIN_END, Pin.IN, Pin.PULL_UP)
        
        # Set to max value if the endstop is not pressed on boot
        if self.pin_end.value():
            self.steps = self.max_steps
        
        self.timer = Timer()
        self.timer.init(period=int(self.full_step_delay_ms), mode=Timer.PERIODIC, callback=self.move_task)

    def __del__(self):
        self.timer.deinit()

    def set_percentage(self, pct = 0):
        self.endstop_initial_lock = not self.pin_end.value()
        pct = max(min(pct, 100), 0)
        self.target_steps = round(pct * self.max_steps / 100)

    def get_cur_percentage(self):
        return round(100 * self.steps / self.max_steps)

    def get_tgt_percentage(self):
        return round(100 * self.target_steps / self.max_steps)

    endstop_timer_lock = False
    def release_lock(self, timer: Timer):
        self.endstop_initial_lock = False
        self.endstop_timer_lock = False

    def move_task(self, timer: Timer):
        if self.endstop_initial_lock:
            if not self.endstop_timer_lock and self.pin_end.value():
                self.endstop_timer_lock = True
                Timer(period=500, mode=Timer.ONE_SHOT, callback=self.release_lock)
        elif not self.pin_end.value():
            # Reset step count when an endstop is reached
            self.steps = self.target_steps

        if self.steps > self.target_steps:
            self.steps -= 1
            self.pin_dir.value(self.reverse_dir)
        elif self.steps < self.target_steps:
            self.steps += 1
            self.pin_dir.value(not self.reverse_dir)
        else:
            # Disengage Stepper
            self.pin_ena.value(1)
            return
        # Engage Stepper
        self.pin_ena.value(0)

state = State()

while True:
    wlan = wifi_connect()
    consec_fail = 0
    while True:
        if not push_poll(state):
            time.sleep_ms(1000)
            consec_fail += 1
        else:
            consec_fail = 0
            time.sleep_ms(200)
        gc.collect()
        
        if consec_fail > 10:
            print('Reinitializing WiFi...')
            wlan.active(False)
            break


