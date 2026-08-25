import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { CARDS } from './cards.mjs';
const at = (n) => readFileSync(new URL('./' + n, import.meta.url), 'utf8');

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// Stamped so a reader can tell whether the "Сейчас" column is still true.
// Дата И ВРЕМЯ. Владелец трижды подряд смотрел на страницу, которую браузер
// держал со старого захода, и трижды писал «а где группы». По одной дате
// отличить вчерашнюю сборку от сегодняшней он мог, а сегодняшнюю утреннюю от
// сегодняшней дневной — нет. Время в шапке отвечает на это без вопросов.
const NOW = new Date();
const STAMP = `${NOW.toISOString().slice(0, 10).split('-').reverse().join('.')} в ${
  String(NOW.getHours()).padStart(2, '0')}:${String(NOW.getMinutes()).padStart(2, '0')}`;

// Раньше здесь стояла жёсткая фраза «сегодняшние правки в него ещё не вошли».
// Она была правдой один день и ложью в тот же вечер, когда правки выпустили, —
// то есть ровно тот сорт текста, который эта страница и должна ловить. Теперь
// это ВОПРОС к git: чист ли `src/` относительно тега выпущенной версии.
const root = new URL('..', import.meta.url).pathname;
const git = (...args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
const dirty = git('status', '--porcelain', '--', 'src');
const behind = git('diff', '--stat', `v${VERSION}..HEAD`, '--', 'src');
const RELEASED =
  dirty === null || behind === null
    ? `выпущен ${VERSION}`
    : dirty === '' && behind === ''
      ? `ровно тот, что выпущен под номером ${VERSION}`
      : `выпущен ${VERSION}, и правки поверх него сюда уже попали, а в него ещё нет`;

const page = `${at('head.html')}
<div class="wrap">
  <div class="lede">
    <h1>Что придёт в Telegram</h1>
    <p>Каждый вид уведомления: где появляется, чем запускается и как выглядит его карточка сегодня. ${CARDS.length} видов.</p>
    <p class="meta">Карточки напечатал сам пакет, теми же аргументами, какие шлют настоящие отправители. Собрано ${STAMP}, пакет ${RELEASED}.</p>
  </div>

  <nav>${at('nav.html')}</nav>

  <section class="block" id="types">
    <h2>Как устроена любая карточка</h2>
    <ul class="rules">
      <li><b>Строка 1 — три тега</b><span>Что за событие, где, чем кончилось. Это твой фильтр.</span></li>
      <li><b>Строка 2 — значок, тип и ЧТО именно</b><span>Какой прогон, какая задача, какой отчёт. Одинаково у всех восьми типов.</span></li>
      <li><b>Ссылка стоит на этом же имени</b><span>Есть страница в интернете — имя кликается. Отдельной строки со словом «open» не бывает.</span></li>
      <li><b>Куда смотреть — всегда есть</b><span>Красная карточка называет свой лог. Локальный файл ссылкой быть не может, поэтому он моноширинный: тап — и он скопирован.</span></li>
      <li><b>Уточнение — в скобках там же</b><span>За какой день отчёт, с чем сравнили. Отдельной строкой не стоит.</span></li>
      <li><b>Чем кончилось — говорит значок</b><span>Словом это не повторяется нигде.</span></li>
      <li><b>Звонят четыре значка</b><span>🔴 🚨 🚫 ❓. Все остальные приходят молча.</span></li>
      <li><b>Стрелка = сравнение</b><span>Есть с чем сравнить — ▲ ▼ =. Не с чем — просто число, без знака.</span></li>
      <li><b>Список идёт под заголовком</b><span>Курсив с подчёркиванием. Другого способа объявить блок нет.</span></li>
      <li><b>Русский — только человеческий текст</b><span>Тело коммита, заголовок задачи, строка запуска сессии. Всё машинное — по-английски.</span></li>
    </ul>
    <div class="tablewrap"><table class="icons">
      <thead><tr><th>Значок</th><th>Что означает</th><th>Звук</th></tr></thead>
      <tbody>
${at('icons.html')}
      </tbody>
    </table></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Тег</th><th>Вторая строка карточки, звук и что это значит</th><th>Кто шлёт</th></tr></thead>
      <tbody>
${at('types.html')}
      </tbody>
    </table></div>
  </section>

  <section class="block" id="cuts">
    <h2>Почему текст иногда обрезан</h2>
    <ul class="rules">
      <li><b>«…» в конце строки</b><span>Поле держит одну строку. Пришло несколько — осталась первая.</span></li>
      <li><b>Уголок ⌄ в конце цитаты</b><span>Это Telegram сложил длинный текст. Нажми — развернётся, ничего не потеряно.</span></li>
      <li><b>Карточка обрывается</b><span>Потолок Telegram: 4000 знаков, а если приложен файл — 1024. Режется по границе строки, разметка не ломается. Файл приезжает целиком.</span></li>
    </ul>
  </section>

${at('articles.html')}

  <footer>
    <p>«Форум» — группа в Telegram с вкладками: у каждого проекта своя, карточки идут во вкладку Ops.</p>
    <p>Колонка «Сейчас» — состояние на день сборки, указанный вверху; сама она не обновляется.</p>
  </footer>
</div>`;

writeFileSync(new URL('./telegram-cards.html', import.meta.url), page);
console.log('page written,', page.length, 'chars');
