#include "pico/stdlib.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <algorithm>
#include <iostream>
#include <pico/unique_id.h>
#include "pico/time.h"
#include "pico/platform.h"
#include "pico/multicore.h"
#include "pico/mutex.h"
#include "json.hpp"


using json = nlohmann::json;
using namespace std;

#define STEP 2
#define DIR 6
#define ENA 10
#define STOP 14

int main() {
    stdio_usb_init();
    stdio_usb_connected();
}
