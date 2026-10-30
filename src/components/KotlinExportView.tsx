import React, { useState } from 'react';
import { Check, Copy, Download, FileCode, Layers, Smartphone } from 'lucide-react';

export const KotlinExportView: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string>('FridgeEntity');

  const copyToClipboard = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const kotlinFiles: Record<
    string,
    { title: string; package: string; desc: string; code: string }
  > = {
    FridgeEntity: {
      title: 'FridgeEntity.kt (Room Database)',
      package: 'com.famille.frigo.data.local.entity',
      desc: 'Entité Room SQLite pour le stockage persistant hors-ligne du frigo et congélateur',
      code: `package com.famille.frigo.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.time.LocalDate

enum class StorageZone { FRIDGE, FREEZER, PANTRY }
enum class FoodCategory { DAIRY, VEGETABLES, FRUITS, MEAT_FISH, BAKERY, PANTRY, FROZEN, OTHER }

@Entity(tableName = "fridge_items")
data class FridgeEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val category: FoodCategory,
    val zone: StorageZone,
    val quantity: Double,
    val unit: String,
    val expirationDate: LocalDate,
    val addedDate: LocalDate = LocalDate.now(),
    val autoRestock: Boolean = false,
    val restockThreshold: Double = 1.0,
    val isConsumed: Boolean = false
) {
    val daysUntilExpiry: Long
        get() = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), expirationDate)

    val isExpiringSoon: Boolean
        get() = daysUntilExpiry in 0..3

    val isExpired: Boolean
        get() = daysUntilExpiry < 0
}`,
    },
    LoyaltyCard: {
      title: 'LoyaltyCard.kt (Modèle & Barcode)',
      package: 'com.famille.frigo.domain.model',
      desc: 'Gestion des cartes de fidélité et scanner pour les caisses de supermarché',
      code: `package com.famille.frigo.domain.model

enum class BarcodeFormat { EAN_13, CODE_128, QR_CODE }

data class LoyaltyCard(
    val id: String,
    val storeName: String,
    val brandCode: String,
    val cardNumber: String,
    val barcodeFormat: BarcodeFormat,
    val cardColorHex: Long,
    val cashbackBalance: Double = 0.0,
    val notes: String? = null
)

data class StoreLocation(
    val id: String,
    val name: String,
    val brandCode: String,
    val latitude: Double,
    val longitude: Double,
    val address: String,
    val distanceKm: Double = 0.0
)`,
    },
    MealPlannerViewModel: {
      title: 'MealPlannerViewModel.kt (StateFlow & IA)',
      package: 'com.famille.frigo.ui.planner',
      desc: 'Algorithme d’optimisation hebdomadaire selon budget, famille et ingrédients à expirer',
      code: `package com.famille.frigo.ui.planner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.famille.frigo.data.repository.FridgeRepository
import com.famille.frigo.data.repository.GeminiRecipeRepository
import com.famille.frigo.domain.model.Recipe
import com.famille.frigo.domain.model.WeeklyPlan
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class FamilyBudgetConfig(
    val maxWeeklyBudgetEur: Double = 90.0,
    val targetCostPerServing: Double = 3.20,
    val membersCount: Int = 4,
    val dietaryRestrictions: List<String> = listOf("anti_gaspi")
)

data class MealPlanUiState(
    val isLoading: Boolean = false,
    val weeklyPlan: WeeklyPlan? = null,
    val expiringItemsToRescue: List<String> = emptyList(),
    val totalBudgetEstimated: Double = 0.0,
    val errorMessage: String? = null
)

class MealPlannerViewModel(
    private val fridgeRepository: FridgeRepository,
    private val geminiRepository: GeminiRecipeRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MealPlanUiState())
    val uiState: StateFlow<MealPlanUiState> = _uiState.asStateFlow()

    init {
        observeFridgeExpiringItems()
    }

    private fun observeFridgeExpiringItems() {
        viewModelScope.launch {
            fridgeRepository.getExpiringSoonItems().collect { items ->
                _uiState.update { it.copy(expiringItemsToRescue = items.map { it.name }) }
            }
        }
    }

    fun generateOptimizedWeeklyPlan(familyConfig: FamilyBudgetConfig) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val availableItems = fridgeRepository.getAllInStock()
                val plan = geminiRepository.planWeek(
                    fridgeStock = availableItems,
                    budgetEur = familyConfig.maxWeeklyBudgetEur,
                    familySize = familyConfig.membersCount
                )
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        weeklyPlan = plan,
                        totalBudgetEstimated = plan.totalEstimatedCost
                    ) 
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }
}`,
    },
    FridgeScreen: {
      title: 'FridgeScreen.kt (Jetpack Compose)',
      package: 'com.famille.frigo.ui.fridge',
      desc: 'Interface utilisateur Material 3 tactile réactive avec badges de fraîcheur',
      code: `package com.famille.frigo.ui.fridge

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.famille.frigo.R
import com.famille.frigo.data.local.entity.FridgeEntity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FridgeScreen(
    items: List<FridgeEntity>,
    onAddItemClick: () -> Unit,
    onConsumeClick: (FridgeEntity) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_title)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAddItemClick,
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Ajouter un aliment")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Anti-gaspi urgency banner
            val expiringCount = items.count { it.isExpiringSoon }
            if (expiringCount > 0) {
                item {
                    ExpiringBanner(count = expiringCount)
                }
            }

            items(items, key = { it.id }) { item ->
                FridgeItemRow(item = item, onConsume = { onConsumeClick(item) })
            }
        }
    }
}

@Composable
fun ExpiringBanner(count: Int) {
    Surface(
        color = Color(0xFFFFF7ED),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, Color(0xFFFFEDD5))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFEA580C))
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "$count produit(s) expirent dans ≤ 3 jours !",
                color = Color(0xFF9A3412),
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}`,
    },
    StringsI18n: {
      title: 'strings.xml (Support Multilingue)',
      package: 'res/values/strings.xml & res/values-fr/strings.xml',
      desc: 'Architecture i18n Android native pour le support multilingue dès la conception',
      code: `<!-- res/values/strings.xml (Default English) -->
<resources>
    <string name="app_name">Doudou\\'s Home</string>
    <string name="app_title">Doudou\\'s Home</string>
    <string name="tab_fridge">Fridge &amp; Stock</string>
    <string name="tab_recipes">Recipes &amp; Baby</string>
    <string name="tab_home">Home &amp; Chores</string>
    <string name="tab_planner">Weekly Plan</string>
    <string name="tab_loyalty">Loyalty Cards</string>
    <string name="expiring_soon">Expires soon</string>
    <string name="anti_waste_savings">Estimated savings: %1$.2f €</string>
</resources>

<!-- res/values-fr/strings.xml (French Localization) -->
<resources>
    <string name="app_name">Doudou\\'s Home</string>
    <string name="app_title">Doudou\\'s Home</string>
    <string name="tab_fridge">Frigo &amp; Stock</string>
    <string name="tab_recipes">Recettes &amp; Bébés</string>
    <string name="tab_home">Maison &amp; Quotidien</string>
    <string name="tab_planner">Planning Semaine</string>
    <string name="tab_loyalty">Cartes &amp; Magasins</string>
    <string name="expiring_soon">Expire bientôt (≤ 3j)</string>
    <string name="anti_waste_savings">Économies estimées : %1$.2f €</string>
</resources>`,
    },
  };

  const handleDownloadAll = () => {
    const combinedContent = Object.entries(kotlinFiles)
      .map(
        ([key, file]) =>
          `// ========================================================\n// File: ${file.title}\n// Package: ${file.package}\n// Description: ${file.desc}\n// ========================================================\n\n${file.code}\n\n`
      )
      .join('\n');

    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'DoudousHome_Kotlin_JetpackCompose_Source.kt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Smartphone className="w-4 h-4" />
              <span>Architecture Mobile Kotlin & Jetpack Compose</span>
            </div>
            <h2 className="text-xl font-bold font-display">
              Code Source Kotlin Prêt pour Android Studio
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-xl">
              Architecture moderne Clean Architecture & MVVM spécialement conçue pour votre
              projet mobile familial, avec support multilingue natif (Android strings), Room DB
              hors-ligne et intégration IA.
            </p>
          </div>
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs rounded-xl shadow transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger tout le code Kotlin</span>
          </button>
        </div>
      </div>

      {/* Code Browser */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* File Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 p-2 gap-1.5 no-scrollbar">
          {Object.entries(kotlinFiles).map(([key, file]) => (
            <button
              key={key}
              onClick={() => setActiveFile(key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeFile === key
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-600" />
              <span>{key}.kt</span>
            </button>
          ))}
        </div>

        {/* File Content */}
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {kotlinFiles[activeFile].title}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {kotlinFiles[activeFile].package} · {kotlinFiles[activeFile].desc}
              </p>
            </div>
            <button
              onClick={() =>
                copyToClipboard(activeFile, kotlinFiles[activeFile].code)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors shrink-0"
            >
              {copiedKey === activeFile ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier le fichier</span>
                </>
              )}
            </button>
          </div>

          <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-[500px]">
            <code>{kotlinFiles[activeFile].code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
