# memo-doom

These terms describe play, display and installation for the phone controller and MemoMind glasses.

## Play and display

**Phone controller（手机手柄）**:
The touch controls used to play the game from the phone.
_Avoid_: glasses controller, remote engine

**Phone HUD（手机状态面板）**:
The large game status panel on the phone, including health, armor, current weapon, ammunition and keys.
_Avoid_: glasses HUD, diagnostic panel

**Glasses view（眼镜画面）**:
The game image shown on the glasses, including the game's original status bar.
_Avoid_: phone HUD, phone preview

**Quality mode（画质档位）**:
A choice of image detail and display size for the glasses view.
_Avoid_: engine speed, frame-rate setting

**Smooth mode（流畅模式）**:
The quality mode with reduced detail and the same field of view and display size as Native mode.
_Avoid_: guaranteed high frame rate, cropped mode

**Completed display frame（完成发送帧）**:
A game image whose display send operation has completed. This count does not establish a physical glasses refresh.
_Avoid_: panel refresh, rendered panel frame

**Discarded frame（舍弃帧）**:
An older game image replaced by a newer image before its send operation starts.
_Avoid_: transmission error, lost Bluetooth packet

## Installation

**Phone package（手机安装包）**:
The installable phone application artifact. It does not include the glasses companion.
_Avoid_: complete installation, paired installation package

**Paired installation package（双端安装包）**:
An installation artifact that contains the phone application and its compatible glasses companion.
_Avoid_: phone package, source archive

**Install QR code（安装二维码）**:
A scannable entry to the installation service for a specific application version.
_Avoid_: permanent download link, source archive
