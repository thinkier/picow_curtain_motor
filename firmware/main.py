import time
import network
import rp2
import urequests as requests
import ujson as json

from machine import Pin
from secrets import WIFI_SSID, WIFI_PASS


NAME = 'window_dressing'
PHASE_PER_SECOND = 1000
STEPS_PER_MM = 6.9
BLINDS_HEIGHT = 1000
REVERSE_DIR = False

PIN_STP = 2
PIN_DIR = 4
PIN_ENA = 6
PIN_END = 8


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
    print('Connected; ip = ' + ip)

def push_poll(state: State):
    payload = {'at_pct': state.get_percentage()}
    res = requests.post('http://192.168.1.69:44444/' + NAME, json = payload)
    rej = res.json()
    state.set_percentage(rej['target_pct'])

class State:
    max_steps = round(STEPS_PER_MM * BLINDS_HEIGHT)
    reverse_dir = REVERSE_DIR
    half_step_delay_ms = 500 / PHASE_PER_SECOND
    steps = 0
    target_steps = 0
    
    def __init__(self):
        self.pin_stp = Pin(PIN_STP, Pin.OUT)
        self.pin_dir = Pin(PIN_DIR, Pin.OUT)
        self.pin_ena = Pin(PIN_ENA, Pin.OUT)
        self.pin_end = Pin(PIN_END, Pin.IN, Pin.PULL_UP)
    
    def set_percentage(self, pct = 0):
        pct = max(min(pct, 100), 0)
        self.target_steps = round(pct * self.max_steps / 100)
        
    def get_percentage(self):
        return round(100 * self.steps / self.max_steps)
    
    def poll_move(self):
        if not self.pin_end.value():
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
        
        # Send a fairly accurately-timed square phase
        self.pin_stp.on()
        time.sleep_ms(half_step_delay_ms)
        self.pin_stp.off()
        time.sleep_ms(half_step_delay_ms)
        

wifi_connect()
state = State()
push_poll(state)


