<%
REM 管理栏目设置
dim menu(10)

menu(1)="管理员管理"
menu(2)="常规管理"
menu(3)="关于我们"
menu(4)="新闻管理"
menu(5)="用户服务"
menu(6)="产品管理"
menu(7)="留言管理"
menu(8)="订单管理"
menu(9)="招聘管理"
menu(10)="生成HTML管理" 
 
 '======================  管理员权限Begin======================================+
function HOPE_check(HOPE_Se,HOPE_str)
	HOPE_OK=false
	if instr(HOPE_Se,",")>0 then
	HOPE_Dim=Split(HOPE_Se,",")
		
	for i=0 to ubound(HOPE_Dim)
		if Cint(Trim(HOPE_Dim(i)))=Cint(Trim(HOPE_str)) then 
			HOPE_OK=true
		end if
	next
	end if
	HOPE_check=HOPE_OK
end Function
'======================benming 管理员权限End======================================+
%>