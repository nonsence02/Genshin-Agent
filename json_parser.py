import ollama
import sys
import io

# Чиним кодировку для консоли Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def parse_inventory():
    # 1. Читаем твой гигантский JSON
    print("Читаем JSON файл...")
    try:
        with open('inventory.json', 'r', encoding='utf-8') as f:
            raw_json = f.read()
    except FileNotFoundError:
        print("Ошибка: Файл inventory.json не найден!")
        return

    # 2. Формируем правила фильтрации
    system_prompt = (
        "Ты — экспертный ИИ-парсер данных Genshin Impact. "
        "Твоя задача — извлечь из предоставленного JSON-кода только полезную информацию и переписать её в чистый Markdown.\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. АРТЕФАКТЫ: Полностью проигнорируй любые данные об артефактах.\n"
        "2. МАТЕРИАЛЫ: Удали еду, базовую руду и мусор. Оставь Мору, примогемы, крутки, смолу, книги опыта, материалы боссов, диковинки и материалы талантов.\n"
        "3. ОРУЖИЕ: Оставляй только 4★ и 5★ оружие.\n"
        "4. ПЕРСОНАЖИ: Выведи Имя, Уровень, Созвездие и уровни талантов."
    )

    user_prompt = f"Вот мой JSON:\n\n{raw_json}\n\nВыдай только чистый Markdown, без лишнего текста и комментариев."

    print("Отправляем данные в локальную нейросеть (генерация может занять время)...")
    
    # 3. Обращаемся к Ollama с расширенным контекстом
    response = ollama.chat(
        model='qwen2.5:7b-instruct-q4_K_M',
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        options={
            "num_ctx": 24000 # Искусственно расширяем память модели под большой файл
        }
    )

    # 4. Сохраняем готовый результат
    with open('inventory.md', 'w', encoding='utf-8') as f:
        f.write(response['message']['content'])
        
    print("\nГотово! Очищенный файл inventory.md успешно создан.")

if __name__ == "__main__":
    parse_inventory()