from flask import Flask, render_template

app = Flask(__name__)


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/profile')
def profile():
    return render_template('profile.html')


@app.route('/contact')
def contact():
    return render_template('contact.html')


@app.route('/games')
def games():
    return render_template('games.html')


@app.route('/games/fps')
def fps():
    return render_template('fps.html')


@app.route('/works')
def works():
    return render_template('works.html')


@app.route('/works/uppercase')
def uppercase():
    return render_template('touppercase.html')


@app.route('/works/infix')
def infix():
    return render_template('infix.html')


@app.route('/works/area/circle')
def circle():
    return render_template('circle.html')


@app.route('/works/area/triangle')
def triangle():
    return render_template('triangle.html')


@app.route('/works/queue')
def queue_page():
    return render_template('queue.html')


@app.route('/works/linkedlist')
def linkedlist():
    return render_template('linkedlist.html')


if __name__ == '__main__':
    app.run(debug=True)
