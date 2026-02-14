# <img src="https://github.com/ArAnKon/error_monitor/blob/5b6f8aec6f72ec24d84668ac245c41707f146ff8/icons/icon.png" width="32" height="32" alt="Error Monitor Icon"/> Error Monitor

<div align="center">

Расширение для Google Chrome, которое перехватывает ошибки без необходимости открывать DevTools. Все ошибки наглядно отображаются в pop-up уведомлениях.

**Идеальный инструмент для тестировщиков, аналитиков и технической поддержки**, когда DevTools недоступны 😄

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-yellow?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## ✨ Возможности

### 🔍 Перехват ошибок
- **Network ошибки** - мониторинг HTTP-запросов
- **Console ошибки** - мониторинг консольных ошибок

### 📊 Управление историей
- **Общая история ошибок** в отдельном окне
- **Фильтрация** по статус-кодам ошибок
- **Детализация ошибок** со скриншотами и без
- **Сохранение/очистка** истории ошибок

### 🛠️ Дополнительные инструменты
- **Копирование cURL** прямо из pop-up уведомления
- **Создание скриншотов** с автоматическим скачиванием из popup и из уведомлений
- **Экспорт истории** в JSON формате

## 🎯 Интерфейс

### Light Theme
<div align="center">

#### Главное меню
<img src="https://github.com/ArAnKon/error_monitor/blob/main/demonstration/menu.png" width="400" alt="Главное меню"/>

#### Уведомления об ошибках
<img src="https://github.com/ArAnKon/error_monitor/blob/main/demonstration/notifications.png" width="400" alt="Уведомления об ошибках"/>

#### История ошибок
<img src="https://github.com/ArAnKon/error_monitor/blob/2235acc7ceee96534b86393e7210cadbf2e252b8/demonstration/history.png" width="600" alt="История ошибок"/>

</div>

### Dark Theme
<div align="center">

#### Главное меню (Тёмная тема)
<img src="https://github.com/ArAnKon/error_monitor/blob/main/demonstration/menu-dark.png" width="400" alt="Главное меню - Тёмная тема"/>

#### Уведомления об ошибках (Тёмная тема)
<img src="https://github.com/ArAnKon/error_monitor/blob/main/demonstration/notifications-darks.png" width="400" alt="Уведомления - Тёмная тема"/>

#### История ошибок (Тёмная тема)
<img src="https://github.com/ArAnKon/error_monitor/blob/main/demonstration/history-dark.png" width="600" alt="История ошибок - Тёмная тема"/>

</div>

### 🎛️ Дополнительные возможности

<div align="center">

#### Фильтрация в pop-up
<img src="https://github.com/ArAnKon/error_monitor/blob/d87de364be684f426df816d8e4b657f390da9dec/demonstration/filter_in_popup.png" width="400" alt="Фильтрация в pop-up"/>

#### Детали ошибки со скриншотом
<img src="https://github.com/ArAnKon/error_monitor/blob/d87de364be684f426df816d8e4b657f390da9dec/demonstration/details_error_screen_1.png" width="500" alt="Детали ошибки со скриншотом 1"/>
<img src="https://github.com/ArAnKon/error_monitor/blob/d87de364be684f426df816d8e4b657f390da9dec/demonstration/details_error_screen_2.png" width="500" alt="Детали ошибки со скриншотом 2"/>

#### Детали ошибки без скриншота
<img src="https://github.com/ArAnKon/error_monitor/blob/d87de364be684f426df816d8e4b657f390da9dec/demonstration/details_error_no_screen.png" width="500" alt="Детали ошибки без скриншота"/>

#### Копирование cURL
<img src="https://github.com/ArAnKon/error_monitor/blob/d87de364be684f426df816d8e4b657f390da9dec/demonstration/copy_curl.png" width="400" alt="Копирование cURL"/>

#### Шаги воспроизведения
<img src="https://github.com/ArAnKon/error_monitor/blob/2d7fab77de070ee7331bca9a2aafb49ffcf51fe9/demonstration/steps.png" width="500" alt="Шаги воспроизведения">

</div>

## 📦 Установка

### 🛠️ Установка из исходного кода

1. **Скачайте расширение**
   ```bash
   # Клонируйте репозиторий
   git clone https://github.com/ArAnKon/error_monitor.git
   
   # Или скачайте ZIP архив и распакуйте в удобную папку
2. Откройте страницу расширений: Введите в адресную строку браузера chrome://extensions/ и нажмите Enter
3. Включите режим разработчика: Найдите переключатель "Режим разработчика" в правом верхнем углу страницы и активируйте его
4. Загрузите расширение: Нажмите кнопку "Загрузить распакованное расширение"
5. Выберите папку: Найдите и выберите папку на своем компьютере, в которой хранятся файлы расширения
6. Проверьте установку: После успешной загрузки расширение появится в списке на этой странице, а его значок появится в верхней правой части окна браузера.
