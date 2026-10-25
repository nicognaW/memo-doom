#include "doomgeneric.h"
#include "doomkeys.h"
#include "doomstat.h"
#include "d_player.h"
#include "d_items.h"
#include "m_menu.h"
#include "i_video.h"

#include <emscripten.h>
#include <stdint.h>
#include <string.h>

#define KEY_QUEUE_CAPACITY 256
#define FRAME_BYTES (DOOMGENERIC_RESX * DOOMGENERIC_RESY)

typedef struct
{
    uint8_t key;
    uint8_t pressed;
} key_event_t;

static key_event_t key_queue[KEY_QUEUE_CAPACITY];
static uint8_t key_state[256];
static uint8_t palette[256 * 3];
static uint32_t read_index;
static uint32_t write_index;
static uint32_t frame_ready;
static uint32_t input_overflows;

static int queue_push(int pressed, uint8_t key)
{
    uint32_t next = (write_index + 1) % KEY_QUEUE_CAPACITY;
    if (next == read_index) return 0;
    key_queue[write_index].key = key;
    key_queue[write_index].pressed = (uint8_t)(pressed != 0);
    write_index = next;
    return 1;
}

static void queue_neutral(void)
{
    int key;
    for (key = 0; key < 256; ++key)
    {
        if (key_state[key])
        {
            key_state[key] = 0;
            queue_push(0, (uint8_t)key);
        }
    }
}

void MM_QueueKey(int key, int pressed)
{
    uint32_t next;
    if (key < 0 || key > 255) return;
    if (key_state[key] == (pressed != 0)) return;

    next = (write_index + 1) % KEY_QUEUE_CAPACITY;
    if (next == read_index)
    {
        ++input_overflows;
        read_index = write_index = 0;
        queue_neutral();
    }
    key_state[key] = (uint8_t)(pressed != 0);
    queue_push(pressed, (uint8_t)key);
}

void MM_ReleaseKeys(void)
{
    uint32_t next = (write_index + 1) % KEY_QUEUE_CAPACITY;
    if (next == read_index) read_index = write_index = 0;
    queue_neutral();
}

uint32_t MM_InputOverflows(void)
{
    return input_overflows;
}

int DG_GetKey(int *pressed, unsigned char *key)
{
    key_event_t event;
    if (read_index == write_index) return 0;
    event = key_queue[read_index];
    read_index = (read_index + 1) % KEY_QUEUE_CAPACITY;
    *pressed = event.pressed;
    *key = event.key;
    return 1;
}

void DG_Init(void)
{
    memset(DG_ScreenBuffer, 0, FRAME_BYTES);
    memset(palette, 0, sizeof(palette));
    frame_ready = 0;
}

void DG_DrawFrame(void)
{
    int index;
    for (index = 0; index < 256; ++index)
    {
        palette[index * 3] = (uint8_t)colors[index].r;
        palette[index * 3 + 1] = (uint8_t)colors[index].g;
        palette[index * 3 + 2] = (uint8_t)colors[index].b;
    }
    frame_ready = 1;
}

uint32_t MM_ConsumeFrame(void)
{
    uint32_t ready = frame_ready;
    frame_ready = 0;
    return ready;
}

const uint8_t *MM_Frame(void)
{
    return (const uint8_t *)DG_ScreenBuffer;
}

const uint8_t *MM_Palette(void)
{
    return palette;
}

uint32_t DG_GetTicksMs(void)
{
    return (uint32_t)emscripten_get_now();
}

void DG_SleepMs(uint32_t ms)
{
    (void)ms;
}

void DG_SetWindowTitle(const char *title)
{
    (void)title;
}

int MM_GameState(void)
{
    return (int)gamestate;
}

int MM_GameTic(void)
{
    return gametic;
}

int MM_PlayerX(void)
{
    if (!players[consoleplayer].mo) return 0;
    return players[consoleplayer].mo->x >> FRACBITS;
}

int MM_PlayerY(void)
{
    if (!players[consoleplayer].mo) return 0;
    return players[consoleplayer].mo->y >> FRACBITS;
}

int MM_PlayerAngle(void)
{
    if (!players[consoleplayer].mo) return 0;
    return (int)(players[consoleplayer].mo->angle >> 16);
}

int MM_PlayerHealth(void)
{
    if (gamestate != GS_LEVEL || !players[consoleplayer].mo) return -1;
    return players[consoleplayer].mo->health;
}

int MM_PlayerArmor(void)
{
    if (gamestate != GS_LEVEL || !players[consoleplayer].mo) return -1;
    return players[consoleplayer].armorpoints;
}

int MM_PlayerWeapon(void)
{
    if (gamestate != GS_LEVEL || !players[consoleplayer].mo) return -1;
    return (int)players[consoleplayer].readyweapon;
}

int MM_PlayerAmmo(void)
{
    int weapon = MM_PlayerWeapon();
    ammotype_t ammo;
    if (weapon < 0 || weapon >= NUMWEAPONS) return -2;
    ammo = weaponinfo[weapon].ammo;
    if (ammo == am_noammo) return -1;
    if (ammo < 0 || ammo >= NUMAMMO) return -2;
    return players[consoleplayer].ammo[ammo];
}

int MM_PlayerWeapons(void)
{
    int index;
    int mask = 0;
    if (MM_PlayerWeapon() < 0) return 0;
    for (index = 0; index < NUMWEAPONS; ++index)
        if (players[consoleplayer].weaponowned[index]) mask |= 1 << index;
    return mask;
}

int MM_PlayerKeys(void)
{
    int index;
    int mask = 0;
    if (MM_PlayerWeapon() < 0) return 0;
    for (index = 0; index < NUMCARDS; ++index)
        if (players[consoleplayer].cards[index]) mask |= 1 << index;
    return mask;
}

int MM_MenuActive(void)
{
    return menuactive;
}

int MM_DemoPlayback(void)
{
    return demoplayback;
}

int main(int argc, char **argv)
{
    doomgeneric_Create(argc, argv);
    return 0;
}
