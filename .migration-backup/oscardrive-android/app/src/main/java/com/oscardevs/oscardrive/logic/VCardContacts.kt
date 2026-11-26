package com.oscardevs.oscardrive.logic

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.Locale

object VCardContacts {
    const val MAX_PARSED_CONTACTS = 20_000
    const val MAX_IMPORTED_CONTACTS = 500
    const val MAX_IMPORTED_RECORDS = MAX_IMPORTED_CONTACTS * 2
    const val MAX_PHONES_PER_CONTACT = 8

    data class Contact(
        val name: String,
        val tels: List<String>,
        val id: String? = null,
        val updatedMs: Long = 0,
        val deleted: Boolean = false,
    )

    data class ParseResult(val contacts: List<Contact>, val truncated: Boolean)

    data class MergeResult(
        val contacts: List<Contact>,
        val added: Int,
        val merged: Int,
        val skipped: Int,
        val limitReached: Boolean,
    )

    fun parse(source: String): ParseResult {
        val input = source.removePrefix("\uFEFF")
            .replace(Regex("=\\r?\\n"), "")
            .replace("\r\n", "\n")
            .replace("\r", "\n")
        val lines = mutableListOf<String>()
        for (line in input.split('\n')) {
            if ((line.startsWith(' ') || line.startsWith('\t')) && lines.isNotEmpty()) {
                lines[lines.lastIndex] += line.drop(1)
            } else {
                lines += line
            }
        }

        val contacts = mutableListOf<Contact>()
        var inCard = false
        var name = ""
        var fallbackName = ""
        val phones = mutableListOf<String>()

        fun finishCard() {
            if (!inCard) return
            val cleanName = (name.ifBlank { fallbackName })
                .replace(Regex("\\s+"), " ")
                .trim()
            val cleanPhones = phones.distinct()
            if (cleanName.isNotBlank() && cleanPhones.isNotEmpty()) {
                contacts += Contact(cleanName, cleanPhones)
            }
            inCard = false
            name = ""
            fallbackName = ""
            phones.clear()
        }

        for (line in lines) {
            if (line.matches(Regex("(?i)^BEGIN:VCARD(?:;.*)?$"))) {
                finishCard()
                inCard = true
                continue
            }
            if (line.matches(Regex("(?i)^END:VCARD(?:;.*)?$"))) {
                finishCard()
                if (contacts.size > MAX_PARSED_CONTACTS) break
                continue
            }
            if (!inCard) continue
            val colon = line.indexOf(':')
            if (colon <= 0) continue
            val header = line.substring(0, colon)
            val field = header.substringBefore(';').substringAfterLast('.').uppercase(Locale.ROOT)
            val value = unescapeValue(line.substring(colon + 1), header)
            when (field) {
                "FN" -> if (name.isBlank()) name = value.trim()
                "N" -> if (fallbackName.isBlank()) {
                    val parts = value.split(';').map(String::trim)
                    fallbackName = listOfNotNull(
                        parts.getOrNull(3),
                        parts.getOrNull(1),
                        parts.getOrNull(2),
                        parts.getOrNull(0),
                        parts.getOrNull(4),
                    ).filter(String::isNotBlank).joinToString(" ")
                }
                "TEL" -> {
                    val phone = value.removePrefixIgnoreCase("tel:")
                        .substringBefore(';')
                        .map { char ->
                            val digit = "٠١٢٣٤٥٦٧٨٩".indexOf(char)
                            if (digit >= 0) '0' + digit else char
                        }
                        .filter { it.isDigit() || it == '+' }
                        .joinToString("")
                    if (phone.count(Char::isDigit) >= 5) phones += phone
                }
            }
        }
        finishCard()
        return ParseResult(
            contacts = contacts.take(MAX_PARSED_CONTACTS),
            truncated = contacts.size > MAX_PARSED_CONTACTS,
        )
    }

    fun mergeImported(
        existing: List<Contact>,
        imported: List<Contact>,
        nowMs: Long = System.currentTimeMillis(),
        maxContacts: Int = MAX_IMPORTED_CONTACTS,
        maxRecords: Int = MAX_IMPORTED_RECORDS,
    ): MergeResult {
        val contacts = existing.map { it.copy(tels = it.tels.toList()) }.toMutableList()
        val byName = mutableMapOf<String, Int>()
        var activeCount = 0
        for ((index, contact) in contacts.withIndex()) {
            if (contact.deleted) continue
            activeCount++
            val key = nameKey(contact.name)
            if (key.isNotEmpty() && key !in byName) byName[key] = index
        }

        var added = 0
        var merged = 0
        var skipped = 0
        var limitReached = false
        for (source in imported) {
            val cleanName = source.name.trim().take(60)
            val cleanTels = source.tels.map { it.trim().take(30) }
                .filter(String::isNotBlank)
                .distinct()
                .take(MAX_PHONES_PER_CONTACT)
            if (cleanName.isBlank() || cleanTels.isEmpty()) {
                skipped++
                continue
            }
            val key = nameKey(cleanName)
            val existingIndex = byName[key]
            if (existingIndex != null) {
                val previous = contacts[existingIndex]
                val updatedTels = (previous.tels + cleanTels)
                    .distinct()
                    .take(MAX_PHONES_PER_CONTACT)
                if (updatedTels.size > previous.tels.size) {
                    contacts[existingIndex] = previous.copy(tels = updatedTels, updatedMs = nowMs)
                    merged++
                }
            } else if (activeCount < maxContacts && contacts.size < maxRecords) {
                contacts += Contact(cleanName, cleanTels, updatedMs = nowMs)
                byName[key] = contacts.lastIndex
                activeCount++
                added++
            } else {
                skipped++
                limitReached = true
            }
        }
        return MergeResult(contacts, added, merged, skipped, limitReached)
    }

    private fun nameKey(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFKC)
            .trim()
            .lowercase(Locale.ROOT)
            .replace(Regex("\\s+"), " ")

    private fun unescapeValue(value: String, header: String): String {
        val decoded = if (Regex("(?i)ENCODING=(?:QUOTED-PRINTABLE|QP)(?:;|$)").containsMatchIn(header)) {
            decodeQuotedPrintable(value)
        } else {
            value
        }
        val result = StringBuilder(decoded.length)
        var index = 0
        while (index < decoded.length) {
            val char = decoded[index]
            if (char == '\\' && index + 1 < decoded.length) {
                val escaped = decoded[index + 1]
                result.append(if (escaped == 'n' || escaped == 'N') ' ' else escaped)
                index += 2
            } else {
                result.append(char)
                index++
            }
        }
        return result.toString()
    }

    private fun decodeQuotedPrintable(value: String): String {
        val bytes = ByteArrayOutputStream(value.length)
        var index = 0
        while (index < value.length) {
            if (
                value[index] == '=' &&
                index + 2 < value.length &&
                value.substring(index + 1, index + 3).all { it.digitToIntOrNull(16) != null }
            ) {
                bytes.write(value.substring(index + 1, index + 3).toInt(16))
                index += 3
            } else {
                val codePoint = value.codePointAt(index)
                bytes.write(String(Character.toChars(codePoint)).toByteArray(StandardCharsets.UTF_8))
                index += Character.charCount(codePoint)
            }
        }
        return String(bytes.toByteArray(), StandardCharsets.UTF_8)
    }

    private fun String.removePrefixIgnoreCase(prefix: String): String =
        if (startsWith(prefix, ignoreCase = true)) drop(prefix.length) else this
}
