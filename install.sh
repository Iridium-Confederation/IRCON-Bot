#!/bin/bash
sudo cp ircon-bot.service /etc/systemd/system/
sudo systemctl enable ircon-bot
sudo systemctl start ircon-bot
