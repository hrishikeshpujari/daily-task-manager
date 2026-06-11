package me.hrishi.taskpa

import android.app.Activity
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.Toast

/**
 * The widget's ➕ target: a small dialog with one text box. Saves locally in an instant,
 * then SyncWorker pushes to the gist and has Claude prioritize it in the background.
 */
class QuickAddActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.quick_add)
        setFinishOnTouchOutside(true)

        val input = findViewById<EditText>(R.id.input)

        fun submit() {
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                Store.addTask(this, text)
                TaskWidget.updateAll(this)
                SyncWorker.enqueueOnce(this, withPa = true)
                Toast.makeText(this, getString(R.string.added_toast), Toast.LENGTH_SHORT).show()
            }
            finish()
        }

        findViewById<Button>(R.id.add).setOnClickListener { submit() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) { submit(); true } else false
        }
        input.requestFocus()
    }
}
