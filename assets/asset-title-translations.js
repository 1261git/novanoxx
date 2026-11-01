(function(root){
 'use strict';
 // Display translations only. Creator originals and unknown titles stay unchanged.
 const rows=[
 ['여행 준비, 파우치에 쏙 — 캐리어 정리 쇼핑쇼츠','Pack for your trip — Travel organizer shopping short','Prepara tu viaje — Short de organizadores de equipaje','轻松出行 — 行李收纳袋购物短片','Chuẩn bị chuyến đi — Video ngắn về túi sắp xếp hành lý','Reisebereit — Shopping-Short für Kofferorganizer'],
 ['새벽의 향기 — 시네마틱 향수 광고','Scent of dawn — Cinematic perfume commercial','Aroma del amanecer — Anuncio cinematográfico de perfume','黎明之香 — 电影感香水广告','Hương bình minh — Quảng cáo nước hoa điện ảnh','Duft der Morgendämmerung — Filmischer Parfümwerbespot'],
 ['고양이 화장실 루틴 — 에버크린 고양이 모래 쇼핑쇼츠','Litter box routine — Ever Clean cat litter shopping short','Rutina del arenero — Short de arena para gatos Ever Clean','猫砂盆日常 — Ever Clean猫砂购物短片','Chăm sóc khay vệ sinh — Video ngắn về cát mèo Ever Clean','Katzenklo-Routine — Shopping-Short für Ever Clean Katzenstreu'],
 ['냉장고 정리의 시작 — 자이티 정리 트레이 쇼핑쇼츠','Organize your fridge — Jaiti organizer tray shopping short','Organiza tu nevera — Short de bandejas organizadoras Jaiti','冰箱整理第一步 — Jaiti收纳托盘购物短片','Sắp xếp tủ lạnh — Video ngắn về khay Jaiti','Ordnung im Kühlschrank — Shopping-Short für Jaiti Organizer'],
 ['털 고민을 담은 일상 — 웰티움 먼지제거 브러쉬 쇼핑쇼츠','Everyday pet hair care — Weltium lint brush shopping short','Cuidado diario del pelo de mascotas — Short del cepillo Weltium','日常宠物毛发清理 — Weltium除毛刷购物短片','Làm sạch lông thú hằng ngày — Video ngắn về bàn chải Weltium','Tierhaare im Alltag — Shopping-Short für die Weltium Fusselbürste'],
 ['세탁기 관리 루틴 — 비트 몬스터팟 쇼핑쇼츠','Washing machine care — Beat Monster Pot shopping short','Cuidado de la lavadora — Short de Beat Monster Pot','洗衣机养护日常 — Beat Monster Pot购物短片','Chăm sóc máy giặt — Video ngắn về Beat Monster Pot','Waschmaschinenpflege — Shopping-Short für Beat Monster Pot'],
 ['일상 속 선케어 — 달바 톤업 선크림 쇼핑쇼츠','Everyday sun care — d’Alba tone-up sunscreen shopping short','Protección solar diaria — Short de protector solar d’Alba','日常防晒 — d’Alba润色防晒霜购物短片','Chống nắng hằng ngày — Video ngắn về kem nâng tông d’Alba','Sonnenschutz im Alltag — Shopping-Short für d’Alba Tone-up Sonnencreme'],
 ['이불 정리의 시작 — 로렌드 진공 압축팩 쇼핑쇼츠','Organize your bedding — Lorend vacuum bag shopping short','Organiza tu ropa de cama — Short de bolsas al vacío Lorend','被褥收纳第一步 — Lorend真空压缩袋购物短片','Sắp xếp chăn màn — Video ngắn về túi hút chân không Lorend','Bettzeug verstauen — Shopping-Short für Lorend Vakuumbeutel']
 ];
 const codes=['ko','en','es','zh-Hans','vi','de'];
 const titles=Object.fromEntries(rows.map(row=>[row[0],Object.fromEntries(codes.map((code,i)=>[code,row[i]]))]));
 if(typeof module!=='undefined')module.exports=titles;else root.NNX_ASSET_TITLE_TRANSLATIONS=titles;
})(typeof globalThis!=='undefined'?globalThis:this);
