cmake_minimum_required(VERSION 3.13)
set(NAME wireless_curtain_motor)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

# initialize pico-sdk from submodule
# note: this must happen before project()
include(../pico-sdk/pico_sdk_init.cmake)

project(${NAME} C CXX ASM)

# initialize the Raspberry Pi Pico SDK
pico_sdk_init()

# rest of your project
add_executable(${NAME} main.cpp)

target_link_libraries(${NAME}
        pico_stdlib
        pico_multicore
        pico_sync
        )

# enable usb output
pico_enable_stdio_usb(${NAME} 1)
pico_enable_stdio_uart(${NAME} 0)

pico_add_extra_outputs(${NAME})

# create map/bin/hex/uf2 file in addition to ELF.
pico_add_extra_outputs(${NAME})
