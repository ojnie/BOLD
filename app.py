import math
from flask import Flask, render_template, request, redirect, url_for, flash

app = Flask(__name__)
app.secret_key = "change-this-to-any-random-text"   # needed for flash() messages


# ---------------------------------------------------------------
# LINKED LIST (singly linked, kept in memory while the server runs)
# ---------------------------------------------------------------
class Node:
    def __init__(self, data):
        self.data = data
        self.next = None


class LinkedList:
    def __init__(self):
        self.head = None

    def insert_head(self, data):
        node = Node(data)
        node.next = self.head
        self.head = node

    def insert_tail(self, data):
        node = Node(data)
        if self.head is None:
            self.head = node
            return
        current = self.head
        while current.next:
            current = current.next
        current.next = node

    def delete(self, data):
        """Remove the first node holding `data`. Returns True if found."""
        current = self.head
        previous = None
        while current:
            if current.data == data:
                if previous:
                    previous.next = current.next
                else:
                    self.head = current.next
                return True
            previous = current
            current = current.next
        return False

    def search(self, data):
        """Return the position (starting at 1) of `data`, or -1 if not found."""
        current = self.head
        position = 1
        while current:
            if current.data == data:
                return position
            current = current.next
            position += 1
        return -1

    def to_list(self):
        items = []
        current = self.head
        while current:
            items.append(current.data)
            current = current.next
        return items


my_list = LinkedList()


# ---------------------------------------------------------------
# MAIN PAGES
# ---------------------------------------------------------------
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


# ---------------------------------------------------------------
# WORKS (programming activities)
# ---------------------------------------------------------------
@app.route('/works')
def works():
    return render_template('works.html')


@app.route('/works/uppercase', methods=['GET', 'POST'])
def uppercase():
    result = None
    if request.method == 'POST':
        result = request.form['inputString'].upper()
    return render_template('touppercase.html', result=result)


@app.route('/works/area/circle', methods=['GET', 'POST'])
def circle():
    result = None
    error = None
    if request.method == 'POST':
        try:
            radius = float(request.form['radius'])
            if radius < 0:
                error = "Radius cannot be negative."
            else:
                result = round(math.pi * radius ** 2, 2)
        except ValueError:
            error = "Please enter a valid number."
    return render_template('circle.html', result=result, error=error)


@app.route('/works/area/triangle', methods=['GET', 'POST'])
def triangle():
    result = None
    error = None
    if request.method == 'POST':
        try:
            base = float(request.form['base'])
            height = float(request.form['height'])
            if base < 0 or height < 0:
                error = "Base and height cannot be negative."
            else:
                result = round(0.5 * base * height, 2)
        except ValueError:
            error = "Please enter valid numbers for base and height."
    return render_template('triangle.html', result=result, error=error)


@app.route('/works/linkedlist', methods=['GET', 'POST'])
def linkedlist():
    if request.method == 'POST':
        action = request.form.get('action')
        value = request.form.get('value', '').strip()

        if action == 'clear':
            my_list.head = None
            flash("List cleared.")
        elif value == '':
            flash("Please enter a value first.")
        elif action == 'insert_head':
            my_list.insert_head(value)
            flash(f"Inserted '{value}' at the head.")
        elif action == 'insert_tail':
            my_list.insert_tail(value)
            flash(f"Inserted '{value}' at the tail.")
        elif action == 'delete':
            if my_list.delete(value):
                flash(f"Deleted '{value}'.")
            else:
                flash(f"'{value}' was not found in the list.")
        elif action == 'search':
            position = my_list.search(value)
            if position == -1:
                flash(f"'{value}' was not found in the list.")
            else:
                flash(f"'{value}' found at position {position}.")

        # redirect so refreshing the page does not repeat the action
        return redirect(url_for('linkedlist'))

    return render_template('linkedlist.html', items=my_list.to_list())


if __name__ == '__main__':
    app.run(debug=True)
