import ollama
import sys
import io

# Принудительно ставим кодировку UTF-8 для вывода в консоль Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_agent():
    system_prompt = (
        "Ты — прагматичный AI-ассистент по Genshin Impact. "
        "Твоя цель — максимизировать эффективность аккаунта, оптимизировать трату смолы "
        "и выдавать ответы четко, в формате markdown, без лишней воды."
    )

    user_prompt = "Привет. Мне нужно прокачать нового саппорта. У меня есть 5 густой смолы. На что эффективнее всего ее потратить в первую очередь?"

    print("Отправляю запрос локальной модели...")
    
    response = ollama.chat(model='qwen2.5:7b-instruct-q4_K_M', messages=[
        {
            'role': 'system',
            'content': system_prompt
        },
        {
            'role': 'user',
            'content': user_prompt
        }
    ])

    print("\nОтвет Агента:\n")
    print(response['message']['content'])

if __name__ == "__main__":
    test_agent()