# StudyDesk

![Tests](https://github.com/xSworfish-code/studydesk/actions/workflows/tests.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-2F4BD8.svg)

This is my second project. I'm a high school student in Honduras, where most schools have 4 parciales and you pass with 70. The idea started with a question every student asks during the year: "if I got this in the first parciales, how much do I need in the rest to pass?" I made a web app that answers it, and then added other tools to stay organized.

Live demo: https://xsworfish-code.github.io/studydesk/

[Leer en español](#español)

## How I made it

I used AI (Claude) as support while building StudyDesk. It helped me write and review the code and explained things I didn't know yet, like how service workers make an app work offline or why a timer should store the end time instead of counting seconds. I'm using the project to learn those ideas and I'll keep improving it.

## What it does

- **Today:** the class you're in right now, the next one, your upcoming deadlines and your overall average, all on one screen.
- **Grades:** each subject has 4 parciales. You can type the grade directly or add the activities of the parcial (homework, exams, projects) with their points. It tells you what you need in the remaining parciales to pass with 70, or to reach your own goal.
- **Year average:** your overall average for the year, the average of each parcial across all subjects, and how many subjects you're passing.
- **Letter grades and GPA:** every average also shows its US/Canada equivalent (A to F and GPA on a 4.0 scale), using the College Board table. Useful if you plan to apply to universities abroad. Bilingual schools can switch the whole app to the American system, with quarters and letters.
- **University:** a separate section with terms and courses with credits (UV). It calculates the academic index the way UNAH does (each grade times its credits, divided by the total credits), the graduation index (only passed courses) and an equivalent GPA.
- **Tasks:** homework with due dates, sorted into overdue, today, this week and later.
- **Schedule:** your week of classes. The one in progress is highlighted and it warns you if two classes overlap.
- **Pomodoro:** a study timer with focus blocks and breaks, a sound when it ends and optional notifications.

The number of parciales and the passing grades (school and university) can be changed in Settings, in case your school uses a different system. Letter grades and GPA are only an estimate: every university does its own conversion. The app is in Spanish and English and has light and dark mode.

## Works offline, no account

You can install StudyDesk on your phone like a normal app (browser menu, "Add to Home screen"), and it works without internet.

There are no accounts and no server. Your grades and tasks are saved only in your browser, so nobody else can see them. Since that means they live in one device, there's a button to download a backup file and restore it somewhere else.

## Security stuff I tried to get right

- Everything you type is shown as plain text, never as HTML. The page has a strict Content Security Policy with Trusted Types, so the browser blocks code injection. The only exception is a tiny policy that allows loading exactly one file: the service worker.
- The page doesn't load anything from other sites. Even the fonts are inside the repo.
- Data from storage or from an imported backup is checked field by field before the app uses it. Wrong types, huge texts or unknown fields get thrown away.
- The tests include a check that reads my own code and fails if dangerous things like `innerHTML` or `eval` show up.

## Project structure

```
studydesk/
├── index.html              # App layout
├── css/styles.css          # Notebook design, light/dark, mobile tab bar
├── fonts/                  # Bricolage Grotesque + Lexend (SIL OFL)
├── icons/                  # App icons for the PWA
├── manifest.webmanifest    # Makes it installable
├── sw.js                   # Service worker (offline mode)
├── js/
│   ├── grades.js           # Averages, needed grade, letters/GPA, university index
│   ├── planner.js          # Tasks by due date, current/next class
│   ├── pomodoro.js         # Timer logic
│   ├── store.js            # Saving, validation, backups
│   ├── i18n.js             # Spanish / English
│   └── app.js              # Connects everything to the page
└── tests/                  # 37 tests (node:test)
```

## Running it

Open `index.html` in your browser. Offline mode and installing only work when it's served over HTTPS (like on GitHub Pages) or from `localhost` (`npm start`).

To run the tests you need Node.js 22 or newer:

```bash
npm test
```

## Things I want to add

- [ ] Reminders the day before a deadline
- [ ] A chart of my grades during the year
- [ ] Sync between phone and computer without needing a server

## Credits

Made by Asaf Rojas (Sworfish Tech), Honduras. MIT License, see [LICENSE](LICENSE). Fonts: Bricolage Grotesque and Lexend, both under the SIL Open Font License.

## Español

Este es mi segundo proyecto. Soy estudiante de colegio en Honduras, donde casi siempre hay 4 parciales y se pasa con 70. La idea empezó con la pregunta que todo estudiante se hace durante el año: "si saqué esto en los primeros parciales, ¿cuánto necesito en los que faltan para pasar?". Hice una app web que lo responde y después le agregué otras herramientas para organizarse.

Usé IA (Claude) como apoyo: me ayudó a escribir y revisar el código y me explicó cosas que todavía no sabía, como hacer que una app funcione sin internet. Estoy usando el proyecto para aprender y lo voy a seguir mejorando.

Lo que tiene:

- Hoy: la clase en la que estás, la siguiente, tus próximas entregas y tu promedio general.
- Notas: 4 parciales por materia, con la nota directa o por actividades (el acumulativo). Te dice cuánto necesitas en los parciales que faltan para pasar con 70 o para llegar a tu meta.
- Promedio general del año, promedio de cada parcial entre todas las materias y cuántas materias vas aprobando.
- Equivalencia en letras (A a F) y GPA, por si vas a aplicar a universidades en el extranjero. Los colegios bilingües pueden usar el sistema americano completo.
- Universidad: periodos y clases con unidades valorativas (UV). Calcula el índice académico como la UNAH (nota por UV entre el total de UV), el índice de graduación y el GPA equivalente.
- Tareas: entregas con fecha, ordenadas en atrasadas, para hoy, esta semana y más adelante.
- Horario: tu semana de clases, resaltando la que está en curso.
- Pomodoro: temporizador de estudio con descansos y aviso al terminar.

Se instala en el teléfono como app y funciona sin internet. No tiene cuentas ni servidor: tus notas se guardan solo en tu navegador y puedes descargar una copia de seguridad.

Para usarlo, entra a la demo o abre `index.html`. Las pruebas corren con `npm test`.
